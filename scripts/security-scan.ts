/**
 * Daily vulnerability scan.
 *
 * Reads the whole repository and then the running database, and answers one
 * question: can anyone write, read or inject something they should not?
 *
 * Results are private. They are written to .security-scans/, which is ignored
 * by git, so nothing here is published to the site or pushed to a code host.
 * A failure that was not in the previous scan makes the run exit non-zero.
 *
 *   bun run scan:security          # write today's scan
 *   bun run scan:security --check  # print the result, write nothing
 *   bun run scan:security --static # skip the live database half
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import type { Finding, ScanReport } from './security-scan-types';
import { liveFindings } from './security-scan-live';

const OUT_DIR = '.security-scans';
const INDEX_PATH = join(OUT_DIR, 'index.json');
const ACCEPTED_PATH = 'docs/security/accepted.json';
const MIGRATIONS_DIR = 'supabase/migrations';
const CODE_ROOTS = ['src', 'extension/src', 'scripts'];

/** Files that are allowed to look suspicious, with the reason. */
type Accepted = { id: string; reason: string };

function acceptedFindings(): Accepted[] {
  try {
    return JSON.parse(readFileSync(ACCEPTED_PATH, 'utf8')) as Accepted[];
  } catch {
    return [];
  }
}

function walk(path: string, files: string[] = []): string[] {
  let info;
  try {
    info = statSync(path);
  } catch {
    return files;
  }
  if (!info.isDirectory()) {
    files.push(path);
    return files;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    walk(join(path, entry.name), files);
  }
  return files;
}

function sourceFiles(): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = [];
  for (const root of CODE_ROOTS) {
    for (const path of walk(root)) {
      if (!/\.(ts|tsx|js|jsx|json|html)$/.test(path)) continue;
      // The scanner quotes the very patterns it looks for, so it never scans itself.
      if (path.startsWith('scripts/security-scan')) continue;
      files.push({ path, text: readFileSync(path, 'utf8') });
    }
  }
  return files;
}

function migrationSql(): { files: string[]; sql: string } {
  let names: string[] = [];
  try {
    names = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort();
  } catch {
    names = [];
  }
  const sql = names.map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8')).join('\n');
  return { files: names, sql };
}

function tablesIn(lower: string): string[] {
  const names = new Set<string>();
  for (const match of lower.matchAll(/create table (?:if not exists )?public\.([a-z0-9_]+)/g)) {
    names.add(match[1] as string);
  }
  return [...names];
}

function verdict(id: string, area: string, bad: string[], good: string, badLead: string): Finding {
  return {
    id,
    area,
    verdict: bad.length ? 'FAIL' : 'PASS',
    evidence: bad.length ? `${badLead} ${bad.join(', ')}.` : good,
  };
}

/** The database half: what the migration history says we intended. */
function migrationChecks(sql: string, files: string[], tables: string[]): Finding[] {
  const lower = sql.toLowerCase();
  const findings: Finding[] = [];

  findings.push({
    id: 'S1',
    area: 'migrations',
    verdict: files.length && tables.length ? 'PASS' : 'FAIL',
    evidence: files.length
      ? `${files.length} migrations create ${tables.length} tables, all in the app's own schema.`
      : 'No migration history was found to check.',
  });

  findings.push(
    verdict(
      'S2',
      'database write paths',
      tables.filter((t) => !lower.includes(`alter table public.${t} enable row level security`)),
      `Row level security is switched on for all ${tables.length} tables.`,
      'Row level security is never switched on for:',
    ),
  );

  findings.push(
    verdict(
      'S3',
      'database write paths',
      tables.filter((t) => !new RegExp(`grant [^;]+ on public\\.${t}\\b`).test(lower)),
      'Every table states, in writing, who may touch it.',
      'No explicit privileges are stated for:',
    ),
  );

  const policyTables = new Set(
    [...lower.matchAll(/create policy[\s\S]*?on public\.([a-z0-9_]+)/g)].map(
      (match) => match[1] as string,
    ),
  );
  findings.push(
    verdict(
      'S4',
      'database write paths',
      tables.filter((t) => !policyTables.has(t)),
      'Every table carries at least one access rule.',
      'No access rule was ever written for:',
    ),
  );

  const policies = lower.match(/create policy[\s\S]*?;/g) ?? [];
  const droppedPolicies = new Set(
    (lower.match(/drop policy (if exists )?"[^"]+"/g) ?? []).map(
      (statement) => statement.match(/"([^"]+)"/)?.[1]?.toLowerCase() ?? '',
    ),
  );
  const metricsInsertRevoked =
    /revoke insert(?:, update, delete)?[^;]*on public\.platform_events from anon, authenticated/.test(
      lower,
    );
  const blanket = policies
    .filter((policy) => {
      if (!/for (insert|update|delete|all)/.test(policy)) return false;
      if (!/(using|with check)\s*\(\s*true\s*\)/.test(policy)) return false;
      if (/to service_role/.test(policy)) return false;
      // Intentional: probe sink is append-only and never read back.
      if (/on public\.probe_events\b/.test(policy)) return false;
      const name = policy.match(/create policy "([^"]+)"/)?.[1]?.toLowerCase() ?? '';
      // Dropped historical platform_events insert rules do not count.
      if (droppedPolicies.has(name)) return false;
      return true;
    })
    .map((policy) => policy.match(/create policy "([^"]+)"/)?.[1] ?? 'an unnamed rule');
  findings.push(
    verdict(
      'S5',
      'database write paths',
      blanket,
      'No rule lets anyone write anything: every write is tied to the person doing it.',
      'These rules allow a write with no ownership check:',
    ),
  );

  const grants = lower.match(/grant [^;]+ to [^;]+;/g) ?? [];
  const anonWrites = grants.filter((grant) => {
    if (!/\banon\b/.test(grant)) return false;
    if (!/(insert|update|delete|truncate|all)\b/.test(grant.split(' on ')[0] ?? '')) return false;
    // Intentional: probe sink is the only anonymous write left.
    if (/public\.probe_events\b/.test(grant)) return false;
    // Historical metrics grants are fine only once insert was revoked.
    if (/public\.platform_events\b/.test(grant) && metricsInsertRevoked) return false;
    return true;
  });
  if (!metricsInsertRevoked) {
    anonWrites.push('platform_events insert was never revoked from anon/authenticated');
  }
  findings.push(
    verdict(
      'S6',
      'database write paths',
      anonWrites,
      'The only thing an anonymous visitor may write is the append-only probe sink.',
      'Anonymous visitors are granted writing rights by:',
    ),
  );

  const truncate = grants.filter(
    (grant) => /\btruncate\b/.test(grant) && /\b(anon|authenticated)\b/.test(grant),
  );
  findings.push(
    verdict(
      'S7',
      'database write paths',
      truncate,
      'Nobody but the backend is ever granted the power to empty a table.',
      'Emptying a table is granted by:',
    ),
  );

  const definers = (sql.toLowerCase().match(/create (or replace )?function[\s\S]*?\$\$/g) ?? [])
    .filter((fn) => fn.includes('security definer'))
    .filter((fn) => !fn.includes('set search_path'))
    .map((fn) => fn.match(/function ([a-z0-9_.]+)/)?.[1] ?? 'an unnamed function');
  findings.push(
    verdict(
      'S8',
      'database write paths',
      definers,
      'Every elevated database function pins the place it looks things up.',
      'These elevated functions do not pin their lookup path:',
    ),
  );

  findings.push({
    id: 'S9',
    area: 'database write paths',
    verdict: /\b(seed_phrase|mnemonic|private_key|secret_key)\b/.test(lower) ? 'FAIL' : 'PASS',
    evidence: /\b(seed_phrase|mnemonic|private_key|secret_key)\b/.test(lower)
      ? 'A migration mentions a wallet secret column, which must never exist.'
      : 'No migration ever creates a place to store a wallet secret.',
  });

  findings.push({
    id: 'S10',
    area: 'database write paths',
    verdict: /disable row level security/.test(lower) ? 'FAIL' : 'PASS',
    evidence: /disable row level security/.test(lower)
      ? 'A migration switches row level security off.'
      : 'No migration ever switches row level security off.',
  });

  return findings;
}

/** Injection, input handling and anything that puts outside text somewhere dangerous. */
function injectionChecks(files: { path: string; text: string }[]): Finding[] {
  const findings: Finding[] = [];

  const html = files
    .filter((file) => file.text.includes('dangerouslySetInnerHTML'))
    .map((file) => file.path)
    .filter((path) => !path.startsWith('src/components/ui/'));
  findings.push(
    verdict(
      'S11',
      'injection',
      html,
      'No screen ever injects raw markup into the page.',
      'Raw markup is injected into the page by:',
    ),
  );

  // A filter built by pasting a value into a string is the classic hole, unless
  // every pasted value came out of one of the shared input guards first.
  const GUARDS =
    /(searchTerm|boundedText|boundedInt|safeImageUrl|isLedgerAddress|isLedgerCurrency)/;
  const filterInterpolation = files
    .filter((file) => {
      const matches = file.text.match(/\.(eq|neq|like|ilike|in|or|filter|match|rpc)\(\s*`[^`]*`/g);
      if (!matches) return false;
      return matches.some((call) => {
        const pasted = [...call.matchAll(/\$\{([^}]+)\}/g)].map((m) => (m[1] ?? '').trim());
        if (!pasted.length) return false;
        return pasted.some((expression) => {
          const name = expression.split(/[^A-Za-z0-9_]/)[0] ?? '';
          const guarded = new RegExp(`(const|let)\\s+${name}\\s*=\\s*${GUARDS.source}\\(`).test(
            file.text,
          );
          return !guarded;
        });
      });
    })
    .map((file) => file.path);
  findings.push(
    verdict(
      'S12',
      'injection',
      filterInterpolation,
      'No database filter is built by pasting a value into a string.',
      'A database filter is built from pasted-in text in:',
    ),
  );

  const rawSql = files
    .filter((file) => /(execute|query)\(\s*`[^`]*\$\{/i.test(file.text))
    .map((file) => file.path)
    .filter((path) => !path.startsWith('scripts/security-scan'));
  findings.push(
    verdict(
      'S13',
      'injection',
      rawSql,
      'No query text is assembled from outside input.',
      'Query text is assembled from outside input in:',
    ),
  );

  const guards = existsSync('src/lib/ingest-guards.ts');
  const tokenIngest = files.find((file) => file.path === 'src/lib/tokens.functions.ts');
  const usesGuards = Boolean(tokenIngest?.text.includes('ingest-guards'));
  findings.push({
    id: 'S14',
    area: 'input handling',
    verdict: guards && usesGuards ? 'PASS' : 'FAIL',
    evidence:
      guards && usesGuards
        ? 'Everything arriving from the outside token feed passes the shared checks before it is stored.'
        : 'Outside input reaches storage without passing the shared checks.',
  });

  const redirects = files
    .filter((file) =>
      /(window\.location\.(href|assign|replace)\s*=?\s*\(?\s*(searchParams|params|query))/.test(
        file.text,
      ),
    )
    .map((file) => file.path);
  findings.push(
    verdict(
      'S15',
      'injection',
      redirects,
      'No page sends a visitor to an address taken straight from the link they arrived on.',
      'A visitor can be sent to an address taken from the link in:',
    ),
  );

  return findings;
}

/** Public endpoints and secrets. */
function endpointChecks(files: { path: string; text: string }[]): Finding[] {
  const findings: Finding[] = [];

  const publicRoutes = files.filter((file) => file.path.startsWith('src/routes/api/public/'));
  const unguarded = publicRoutes
    .filter((file) => !file.text.includes('timingSafeEqual'))
    .map((file) => file.path);
  findings.push({
    id: 'S16',
    area: 'public endpoints',
    verdict: publicRoutes.length === 0 ? 'PASS' : unguarded.length ? 'FAIL' : 'PASS',
    evidence: unguarded.length
      ? `These world-reachable endpoints do not check a secret in a way that resists guessing: ${unguarded.join(', ')}.`
      : `All ${publicRoutes.length} world-reachable endpoints demand a secret and compare it safely.`,
  });

  const acceptsPublishable = publicRoutes
    .filter((file) => /PUBLISHABLE|ANON_KEY/.test(file.text))
    .map((file) => file.path);
  findings.push(
    verdict(
      'S17',
      'public endpoints',
      acceptsPublishable,
      'No endpoint treats the public web key as proof of who is calling.',
      'The public web key is treated as a secret by:',
    ),
  );

  const committed = files
    .filter((file) =>
      /sb_secret_[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(file.text),
    )
    .map((file) => file.path);
  findings.push(
    verdict(
      'S18',
      'secrets',
      committed,
      'No key, seed or password is written into the code.',
      'A secret appears to be written into:',
    ),
  );

  const browserSecrets = files
    .filter((file) => file.path.startsWith('src/'))
    .filter((file) => !/\.server\.|\.functions\.|^src\/routes\/api\//.test(file.path))
    .filter((file) => /SERVICE_ROLE|LOVABLE_API_KEY/.test(file.text))
    .map((file) => file.path);
  findings.push(
    verdict(
      'S19',
      'secrets',
      browserSecrets,
      'No secret is read anywhere the browser can see it.',
      'A secret is read in browser-visible code in:',
    ),
  );

  const adminImports = files
    .filter((file) => /supabaseAdmin/.test(file.text))
    .filter((file) => !/\.server\.|scripts\//.test(file.path))
    .filter((file) => /^import .*supabaseAdmin/m.test(file.text))
    .map((file) => file.path);
  findings.push(
    verdict(
      'S20',
      'secrets',
      adminImports,
      'The all-powerful database client is only ever loaded inside a server handler, after the caller is checked.',
      'The all-powerful database client is loaded at the top of:',
    ),
  );

  return findings;
}

/** Known vulnerabilities in the packages we depend on. */
function dependencyCheck(): Finding {
  const result = spawnSync('bun', ['audit', '--json'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}`.trim();
  if (!output) {
    return {
      id: 'S21',
      area: 'dependencies',
      verdict: 'SKIP',
      evidence: 'The dependency check could not run in this environment.',
    };
  }
  try {
    const parsed = JSON.parse(output) as {
      vulnerabilities?: Record<string, { severity: string }[]>;
    };
    const serious: string[] = [];
    for (const [name, entries] of Object.entries(parsed.vulnerabilities ?? {})) {
      if (entries.some((entry) => /high|critical/i.test(entry.severity))) serious.push(name);
    }
    return {
      id: 'S21',
      area: 'dependencies',
      verdict: serious.length ? 'FAIL' : 'PASS',
      evidence: serious.length
        ? `Packages with a serious known weakness: ${serious.join(', ')}.`
        : 'No package we depend on has a known serious weakness.',
    };
  } catch {
    return {
      id: 'S21',
      area: 'dependencies',
      verdict: /high|critical/i.test(output) ? 'FAIL' : 'PASS',
      evidence: /high|critical/i.test(output)
        ? 'The dependency check reported a serious weakness. Run bun audit for the detail.'
        : 'No package we depend on has a known serious weakness.',
    };
  }
}

function previousFailures(): string[] {
  try {
    const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as {
      date: string;
      failed: number;
      failures: string[];
    }[];
    return index[0]?.failures ?? [];
  } catch {
    return [];
  }
}

function markdown(report: ScanReport): string {
  const rows = report.findings
    .map((f) => `| ${f.id} | ${f.area} | ${f.verdict} | ${f.evidence} |`)
    .join('\n');
  return `# Vulnerability scan - ${report.date}

Private. Not published on the site and not committed to the code host.

- Passed: ${report.passed}
- Failed: ${report.failed}
- Accepted: ${report.accepted}
- Not checked here: ${report.skipped}
- New since the last scan: ${report.newFailures.length ? report.newFailures.join(', ') : 'none'}

| ID | Area | Verdict | Evidence |
| --- | --- | --- | --- |
${rows}
`;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const staticOnly = process.argv.includes('--static');
  const date = new Date().toISOString().slice(0, 10);

  const { files, sql } = migrationSql();
  const tables = tablesIn(sql.toLowerCase());
  const code = sourceFiles();

  const findings: Finding[] = [
    ...migrationChecks(sql, files, tables),
    ...injectionChecks(code),
    ...endpointChecks(code),
    dependencyCheck(),
  ];

  if (!staticOnly) findings.push(...(await liveFindings(tables)));

  const accepted = acceptedFindings();
  for (const finding of findings) {
    const match = accepted.find((entry) => entry.id === finding.id);
    if (match && finding.verdict === 'FAIL') {
      finding.verdict = 'ACCEPTED';
      finding.evidence = `${finding.evidence} Accepted: ${match.reason}`;
    }
  }

  const failures = findings.filter((f) => f.verdict === 'FAIL').map((f) => f.id);
  const before = previousFailures();
  const report: ScanReport = {
    date,
    generatedAt: new Date().toISOString(),
    passed: findings.filter((f) => f.verdict === 'PASS').length,
    failed: failures.length,
    accepted: findings.filter((f) => f.verdict === 'ACCEPTED').length,
    skipped: findings.filter((f) => f.verdict === 'SKIP').length,
    newFailures: failures.filter((id) => !before.includes(id)),
    findings,
  };

  for (const finding of findings) {
    if (finding.verdict === 'FAIL') console.log(`FAIL  ${finding.id}  ${finding.evidence}`);
  }
  console.log(
    `${date}: ${report.passed} passed, ${report.failed} failed, ${report.accepted} accepted, ${report.skipped} not checked here.`,
  );

  if (!checkOnly) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, `${date}.json`), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(OUT_DIR, `${date}.md`), markdown(report));
    let index: { date: string; failed: number; failures: string[] }[] = [];
    try {
      index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
    } catch {
      index = [];
    }
    const merged = [
      { date, failed: report.failed, failures },
      ...index.filter((entry) => entry.date !== date),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 180);
    writeFileSync(INDEX_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  }

  if (report.failed > 0) {
    console.log(
      report.newFailures.length
        ? `New since the last scan: ${report.newFailures.join(', ')}. Fix these.`
        : 'These failures were already open. Fix them.',
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
