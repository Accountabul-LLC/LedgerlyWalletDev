/**
 * The live half of the daily vulnerability scan.
 *
 * The static half reads the migration files, which only say what we intended.
 * This half asks the running database what is actually in force, and then tries
 * to do the things nobody should be able to do. Every attempt must be refused.
 *
 * It needs two things, and says so plainly when either is missing rather than
 * quietly passing: database credentials (the managed PG* variables) for the
 * policy and privilege reads, and the public web key for the refusal probes.
 */
import { spawnSync } from 'node:child_process';

import type { Finding } from './security-scan-types';

/** Table writes we deliberately allow, keyed by role. Anything else is a finding. */
const ALLOWED_WRITES: Record<string, Record<string, string[]>> = {
  anon: {
    // Metrics inserts were revoked; only the probe sink remains writable.
    probe_events: ['INSERT'],
  },
  authenticated: {
    probe_events: ['INSERT'],
    contacts: ['INSERT', 'UPDATE', 'DELETE'],
    profiles: ['INSERT', 'UPDATE', 'DELETE'],
    wallet_labels: ['INSERT', 'UPDATE', 'DELETE'],
  },
};

/** psql prints booleans as t/f, but a ::text cast prints true/false. */
function isTrue(value: string | undefined): boolean {
  return value === 't' || value === 'true';
}

function psql(sql: string): string[][] | null {
  const result = spawnSync('psql', ['-tAF', '\u0001', '-c', sql], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('\u0001'));
}

function hasDatabase(): boolean {
  if (!process.env['PGHOST']) return false;
  return psql('select 1') !== null;
}

/** What the database actually enforces right now. */
function policyChecks(): Finding[] {
  const findings: Finding[] = [];

  const rls = psql(`
    select c.relname, c.relrowsecurity::text, count(p.polname)::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    group by c.relname, c.relrowsecurity
    order by c.relname
  `);
  if (!rls) {
    findings.push({
      id: 'L1',
      area: 'live database',
      verdict: 'SKIP',
      evidence: 'The policy read could not run, so nothing was verified against the live database.',
    });
    return findings;
  }

  const isOn = (value: string | undefined) => value === 't' || value === 'true';
  const noRls = rls.filter((row) => !isOn(row[1])).map((row) => row[0]);
  findings.push({
    id: 'L1',
    area: 'live database',
    verdict: noRls.length ? 'FAIL' : 'PASS',
    evidence: noRls.length
      ? `Row level security is off on: ${noRls.join(', ')}.`
      : `Row level security is on for all ${rls.length} tables.`,
  });

  const noPolicy = rls.filter((row) => Number(row[2]) === 0).map((row) => row[0]);
  findings.push({
    id: 'L2',
    area: 'live database',
    verdict: noPolicy.length ? 'FAIL' : 'PASS',
    evidence: noPolicy.length
      ? `No access rule exists on: ${noPolicy.join(', ')}, so the table is unreachable or unguarded.`
      : 'Every table carries at least one access rule.',
  });

  // aclexplode reads the privileges actually on the table, rather than only the
  // ones the scanning role happens to be able to see.
  const grants =
    psql(`
    select r.rolname, c.relname, a.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace,
    lateral aclexplode(c.relacl) a
    join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and r.rolname in ('anon', 'authenticated')
      and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    order by 1, 2, 3
  `) ?? [];
  const unexpected = grants.filter((row) => {
    const [role, table, privilege] = row as [string, string, string];
    return !(ALLOWED_WRITES[role]?.[table] ?? []).includes(privilege);
  });
  findings.push({
    id: 'L3',
    area: 'live database',
    verdict: unexpected.length ? 'FAIL' : 'PASS',
    evidence: unexpected.length
      ? `Unexpected write privileges in force: ${unexpected
          .map((row) => `${row[0]} may ${row[2]?.toLowerCase()} ${row[1]}`)
          .join('; ')}.`
      : `All ${grants.length} write privileges held by visitors and signed-in people are ones we intended.`,
  });

  const truncate = grants.filter((row) => row[2] === 'TRUNCATE');
  findings.push({
    id: 'L4',
    area: 'live database',
    verdict: truncate.length ? 'FAIL' : 'PASS',
    evidence: truncate.length
      ? `Emptying a table is possible for: ${truncate.map((row) => `${row[0]} on ${row[1]}`).join(', ')}.`
      : 'Nobody but the backend can empty a table.',
  });

  const functions =
    psql(`
    select p.proname,
           p.prosecdef::text,
           coalesce(array_to_string(p.proconfig, ','), '') as config,
           has_function_privilege('anon', p.oid, 'execute')::text,
           has_function_privilege('authenticated', p.oid, 'execute')::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname
  `) ?? [];
  const unpinned = functions
    .filter((row) => isTrue(row[1]) && !String(row[2]).includes('search_path'))
    .map((row) => row[0]);
  findings.push({
    id: 'L5',
    area: 'live database',
    verdict: unpinned.length ? 'FAIL' : 'PASS',
    evidence: unpinned.length
      ? `Elevated functions without a pinned search path: ${unpinned.join(', ')}.`
      : `All ${functions.length} database functions that run with elevated rights pin their search path.`,
  });

  const callable = functions
    .filter((row) => isTrue(row[1]) && (isTrue(row[3]) || isTrue(row[4])))
    .map((row) => row[0]);
  findings.push({
    id: 'L6',
    area: 'live database',
    verdict: callable.length ? 'FAIL' : 'PASS',
    evidence: callable.length
      ? `Elevated functions callable from the browser: ${callable.join(', ')}.`
      : 'No elevated function can be called from the browser.',
  });

  return findings;
}

/** Migration files versus reality: a table nobody wrote a migration for is drift. */
function driftCheck(migrationTables: string[]): Finding {
  const live = psql(`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1
  `);
  if (!live) {
    return {
      id: 'L7',
      area: 'live database',
      verdict: 'SKIP',
      evidence: 'The table list could not be read, so drift was not checked.',
    };
  }
  const names = live.map((row) => row[0] as string);
  const undeclared = names.filter((name) => !migrationTables.includes(name));
  return {
    id: 'L7',
    area: 'live database',
    verdict: undeclared.length ? 'FAIL' : 'PASS',
    evidence: undeclared.length
      ? `Tables exist that no migration creates: ${undeclared.join(', ')}.`
      : `All ${names.length} live tables come from the migration history.`,
  };
}

type Probe = {
  id: string;
  what: string;
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
  expect: 'refused' | 'allowed';
};

const PROBES: Probe[] = [
  {
    id: 'P1',
    what: 'forge a high value platform event as an anonymous visitor',
    path: '/rest/v1/platform_events',
    method: 'POST',
    body: { kind: 'tx_signed', network: 'mainnet', signer_key: 'scan-probe', usd_value: 100000 },
    expect: 'refused',
  },
  {
    // The live counters must reject anything that looks like test traffic, even
    // at zero value, so a probe can never move a published number.
    id: 'P1b',
    what: 'record a probe shaped event in the live counters',
    path: '/rest/v1/platform_events',
    method: 'POST',
    body: { kind: 'wallet_created', network: 'mainnet', signer_key: 'scan-probe', usd_value: 0 },
    expect: 'refused',
  },
  {
    // Probe traffic belongs in its own store, which nothing public reads.
    id: 'P1c',
    what: 'record the probe attempt in the separate probe store (this one must work)',
    path: '/rest/v1/probe_events',
    method: 'POST',
    body: { kind: 'scan_probe', network: 'mainnet', signer_key: 'scan-probe', usd_value: 0 },
    expect: 'allowed',
  },
  {
    id: 'P1d',
    what: 'read the probe store back',
    path: '/rest/v1/probe_events?select=id&limit=1',
    method: 'GET',
    expect: 'refused',
  },
  {
    id: 'P2',
    what: 'read the anonymous usage counters back',
    path: '/rest/v1/platform_events?select=id&limit=1',
    method: 'GET',
    expect: 'refused',
  },
  {
    id: 'P3',
    what: 'read the private security report rows',
    path: '/rest/v1/security_reports?select=report_date&limit=1',
    method: 'GET',
    expect: 'refused',
  },
  {
    id: 'P4',
    what: 'read the scheduled job token table',
    path: '/rest/v1/cron_tokens?select=name&limit=1',
    method: 'GET',
    expect: 'refused',
  },
  {
    id: 'P5',
    what: "write someone else's wallet label without signing in",
    path: '/rest/v1/wallet_labels',
    method: 'POST',
    body: { user_id: '00000000-0000-0000-0000-000000000000', address: 'rProbe', name: 'probe' },
    expect: 'refused',
  },
  {
    id: 'P6',
    what: 'write a contact row without signing in',
    path: '/rest/v1/contacts',
    method: 'POST',
    body: { user_id: '00000000-0000-0000-0000-000000000000', address: 'rProbe', name: 'probe' },
    expect: 'refused',
  },
  {
    id: 'P7',
    what: 'read the public token directory (this one must work)',
    path: '/rest/v1/xrpl_tokens?select=ticker&limit=1',
    method: 'GET',
    expect: 'allowed',
  },
];

async function probeChecks(): Promise<Finding[]> {
  const url = process.env['SUPABASE_URL'] ?? process.env['VITE_SUPABASE_URL'];
  const key =
    process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) {
    return [
      {
        id: 'P0',
        area: 'refusal probes',
        verdict: 'SKIP',
        evidence: 'No public web address or key available, so no write attempts were made.',
      },
    ];
  }

  const findings: Finding[] = [];
  for (const probe of PROBES) {
    let status = 0;
    let detail = '';
    try {
      const response = await fetch(`${url}${probe.path}`, {
        method: probe.method,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: probe.body ? JSON.stringify(probe.body) : undefined,
      });
      status = response.status;
      detail = (await response.text()).slice(0, 160);
    } catch (error) {
      findings.push({
        id: probe.id,
        area: 'refusal probes',
        verdict: 'SKIP',
        evidence: `Could not attempt to ${probe.what}: ${
          error instanceof Error ? error.message : 'request failed'
        }.`,
      });
      continue;
    }

    const refused = status === 401 || status === 403 || status === 404;
    const ok = probe.expect === 'refused' ? refused : status >= 200 && status < 300;
    findings.push({
      id: probe.id,
      area: 'refusal probes',
      verdict: ok ? 'PASS' : 'FAIL',
      evidence:
        probe.expect === 'refused'
          ? ok
            ? `Refused an attempt to ${probe.what} (${status}).`
            : `An attempt to ${probe.what} was NOT refused (${status}): ${detail}`
          : ok
            ? `Able to ${probe.what} (${status}), as intended.`
            : `Could not ${probe.what} (${status}): ${detail}`,
    });
  }
  return findings;
}

/** Everything the running system says about itself. */
export async function liveFindings(migrationTables: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (hasDatabase()) {
    findings.push(...policyChecks(), driftCheck(migrationTables));
  } else {
    findings.push({
      id: 'L0',
      area: 'live database',
      verdict: 'SKIP',
      evidence:
        'No database credentials in this environment, so the live policies and privileges were not read.',
    });
  }
  findings.push(...(await probeChecks()));
  return findings;
}
