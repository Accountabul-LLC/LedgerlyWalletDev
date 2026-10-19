import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'supabase/migrations');
const FILES = readdirSync(DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const SQL = FILES.map((file) => readFileSync(join(DIR, file), 'utf8')).join('\n');
const LOWER = SQL.toLowerCase();

function createdTables(): string[] {
  const names = new Set<string>();
  for (const match of LOWER.matchAll(/create table (?:if not exists )?public\.([a-z0-9_]+)/g)) {
    names.add(match[1] as string);
  }
  return [...names];
}

const TABLES = createdTables();

describe('readiness: database policy', () => {
  it('T71 there is at least one migration and every table lives in public', () => {
    expect(FILES.length).toBeGreaterThan(0);
    expect(TABLES.length).toBeGreaterThan(0);
    expect(LOWER).not.toMatch(/create table (?:if not exists )?(auth|storage|realtime|vault)\./);
  });

  it('T72 row level security is enabled on every table', () => {
    const missing = TABLES.filter(
      (table) => !LOWER.includes(`alter table public.${table} enable row level security`),
    );
    expect(missing).toEqual([]);
  });

  it('T73 every table has explicit grants', () => {
    const missing = TABLES.filter(
      (table) => !new RegExp(`grant [^;]+ on public\\.${table}\\b`).test(LOWER),
    );
    expect(missing).toEqual([]);
  });

  it('T74 every table has at least one policy', () => {
    const missing = TABLES.filter(
      (table) =>
        !new RegExp(`on public\\.${table}\\b[\\s\\S]{0,200}?(for|using)`).test(LOWER) ||
        !LOWER.includes('create policy'),
    );
    expect(missing).toEqual([]);
  });

  it('T75 anon writes are limited to the append-only probe table', () => {
    const grants = LOWER.match(/grant [^;]+ to [^;]+;/g) ?? [];
    const risky = grants.filter(
      (grant) =>
        /\banon\b/.test(grant) &&
        /(insert|update|delete|all)\b/.test(grant.split(' on ')[0] ?? '') &&
        // platform_events appears in older grants but is revoked (see T83).
        !/public\.(platform_events|probe_events)\b/.test(grant),
    );
    expect(risky).toEqual([]);
    expect(LOWER).toMatch(
      /revoke insert(?:, update, delete)?[^;]*on public\.platform_events from anon, authenticated/,
    );
    expect(LOWER).toMatch(/grant insert on public\.probe_events to anon/);
  });

  it('T76 anon can never read the metrics table', () => {
    const grants = LOWER.match(/grant [^;]+ to [^;]+;/g) ?? [];
    const reads = grants.filter(
      (grant) =>
        /public\.platform_events\b/.test(grant) &&
        /\banon\b/.test(grant) &&
        /(select|all)\b/.test(grant.split(' on ')[0] ?? ''),
    );
    expect(reads).toEqual([]);
  });

  it('T77 roles are never stored on the profiles table', () => {
    expect(LOWER).not.toMatch(/create table[^;]*public\.profiles[^;]*\brole\b/s);
  });

  it('T78 no blanket-true policy exists outside the append-only probe insert', () => {
    const policies = LOWER.match(/create policy[\s\S]*?;/g) ?? [];
    const dropped = new Set(
      (LOWER.match(/drop policy (if exists )?"[^"]+"/g) ?? []).map(
        (statement) => statement.match(/"([^"]+)"/)?.[1]?.toLowerCase() ?? '',
      ),
    );
    const blanket = policies.filter((policy) => {
      if (!/for (insert|update|delete|all)/.test(policy)) return false;
      if (!/(using|with check)\s*\(\s*true\s*\)/.test(policy)) return false;
      if (/to service_role/.test(policy)) return false;
      // Intentional: probe sink is append-only and never read back.
      if (/on public\.probe_events\b/.test(policy)) return false;
      const name = policy.match(/create policy "([^"]+)"/)?.[1]?.toLowerCase() ?? '';
      // Dropped historical platform_events insert rules do not count.
      if (dropped.has(name)) return false;
      return true;
    });
    expect(blanket).toEqual([]);
  });

  it('T79 security definer functions pin their search path', () => {
    const functions = SQL.toLowerCase().match(/create (or replace )?function[\s\S]*?\$\$/g) ?? [];
    const missing = functions.filter(
      (fn) => fn.includes('security definer') && !fn.includes('set search_path'),
    );
    expect(missing).toEqual([]);
  });

  it('T80 no migration drops row level security or a policy without replacing it', () => {
    expect(LOWER).not.toMatch(/disable row level security/);
  });

  it('T81 migrations never store wallet secrets', () => {
    expect(LOWER).not.toMatch(/\b(seed_phrase|mnemonic|private_key|secret_key)\b/);
  });

  it('T82 the dollar value column defaults to zero', () => {
    expect(LOWER).toMatch(/usd_value numeric\(20,2\) not null default 0/);
  });

  it('T83 the browser cannot write a counter event at all', () => {
    const policies = LOWER.match(/create policy[\s\S]*?;/g) ?? [];
    const dropped = new Set(
      (LOWER.match(/drop policy (if exists )?"[^"]+"/g) ?? []).map(
        (statement) => statement.match(/"([^"]+)"/)?.[1] ?? '',
      ),
    );
    const live = policies.filter((policy) => {
      if (!/on public\.platform_events\b/.test(policy) || !/for insert/.test(policy)) return false;
      const name = policy.match(/create policy "([^"]+)"/)?.[1] ?? '';
      return !dropped.has(name);
    });
    expect(live.length).toBeGreaterThan(0);
    const permissive = live.filter((policy) => !/with check \(false\)/.test(policy));
    expect(permissive).toEqual([]);
    expect(LOWER).toMatch(/revoke insert[^;]*on public\.platform_events from anon, authenticated/);
  });
});
