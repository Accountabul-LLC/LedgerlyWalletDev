/**
 * Privilege policy.
 *
 * Row level security decides which rows a request may touch, but it says
 * nothing about table-wide privileges. Emptying a table is not filtered by any
 * policy, so a broad grant is a real hole even when every policy looks right.
 * These checks read the migration history and pin the rule that visitors and
 * signed-in people only ever hold the narrow privileges the app needs.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'supabase/migrations');
const FILES = readdirSync(DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const SQL = FILES.map((name) => ({ name, text: readFileSync(join(DIR, name), 'utf8') }));

/** Statements still in force: a later REVOKE undoes an earlier GRANT. */
const LOCKDOWN = SQL.find((file) => /REVOKE ALL ON public\.security_reports/i.test(file.text));

describe('readiness: privilege policy', () => {
  it('T133 the least privilege lockdown migration is part of the history', () => {
    expect(LOCKDOWN).toBeTruthy();
  });

  it('T134 the lockdown revokes every legacy privilege before regranting', () => {
    const text = LOCKDOWN?.text ?? '';
    for (const table of [
      'contacts',
      'profiles',
      'wallet_labels',
      'platform_events',
      'xrpl_tokens',
      'security_reports',
      'cron_tokens',
    ]) {
      expect(text).toMatch(new RegExp(`REVOKE ALL ON public\\.${table} FROM anon, authenticated`));
    }
  });

  it('T135 no table hands blanket privileges to anonymous visitors', () => {
    const offenders = SQL.filter((file) =>
      /GRANT\s+ALL\b[^;]*\bTO\s+[^;]*\banon\b/i.test(file.text),
    ).map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  it('T136 nobody but the backend may empty a table', () => {
    const offenders = SQL.filter((file) =>
      /GRANT[^;]*\bTRUNCATE\b[^;]*\bTO\s+[^;]*\b(anon|authenticated)\b/i.test(file.text),
    ).map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  it('T137 the public reference tables stay read only for visitors', () => {
    const text = LOCKDOWN?.text ?? '';
    expect(text).toMatch(/GRANT SELECT ON public\.xrpl_tokens TO anon, authenticated/);
    expect(text).toMatch(/GRANT SELECT ON public\.security_reports TO anon, authenticated/);
  });

  it('T138 browsers cannot write or read the metrics table', () => {
    const history = SQL.map((file) => file.text).join('\n');
    // Lockdown once granted insert; the counter-integrity migration took it away.
    expect(history).toMatch(
      /REVOKE INSERT(?:, UPDATE, DELETE)? ON public\.platform_events FROM anon, authenticated/i,
    );
    expect(history).not.toMatch(/GRANT SELECT ON public\.platform_events TO anon/);
    // The only anonymous write left is the append-only probe sink.
    expect(history).toMatch(/GRANT INSERT ON public\.probe_events TO anon/i);
  });

  it('T139 the scheduled job token table is reachable by the backend alone', () => {
    const text = LOCKDOWN?.text ?? '';
    expect(text).toMatch(/REVOKE ALL ON public\.cron_tokens FROM anon, authenticated/);
    const granted = SQL.some((file) =>
      /GRANT[^;]*ON public\.cron_tokens TO[^;]*\b(anon|authenticated)\b/i.test(file.text),
    );
    expect(granted).toBe(false);
  });
});
