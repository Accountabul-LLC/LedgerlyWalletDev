/**
 * Probe isolation.
 *
 * Security probes exist to attack our own surfaces, so their traffic must never
 * be able to reach the tables that feed the published counters. Two things keep
 * that true: a separate probe store that nothing public reads, and a rule on the
 * live events table that refuses anything shaped like test traffic. These checks
 * pin both in the migration history, and pin that no shipped code writes probe
 * shaped keys into the live table.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'supabase/migrations');
const SQL = readdirSync(DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(join(DIR, name), 'utf8'))
  .join('\n');

describe('readiness: probe isolation', () => {
  it('T150 a separate probe store exists', () => {
    expect(SQL).toMatch(/CREATE TABLE public\.probe_events/i);
  });

  it('T151 the probe store is never readable from a browser', () => {
    expect(SQL).toMatch(/No browser reads of probe attempts/i);
    expect(SQL).not.toMatch(/GRANT SELECT ON public\.probe_events TO (anon|authenticated)/i);
    // Default privileges grant SELECT (and TRUNCATE) unless a migration revokes them.
    expect(SQL).toMatch(/REVOKE ALL ON public\.probe_events FROM PUBLIC, anon, authenticated/i);
  });

  it('T152 the live counters refuse probe shaped events', () => {
    expect(SQL).toMatch(/reject_probe_platform_events/);
    expect(SQL).toMatch(/probe\|test\|forge\|scan\|fake\|poc\|qa\|sample\|dummy/);
    expect(SQL).toMatch(/CREATE TRIGGER platform_events_reject_probes/);
  });

  it('T153 the probe scripts write their attempts to the probe store', () => {
    const live = readFileSync(join(process.cwd(), 'scripts/security-scan-live.ts'), 'utf8');
    expect(live).toMatch(/\/rest\/v1\/probe_events/);
    const pentest = readFileSync(join(process.cwd(), 'tests/browser/pentest.py'), 'utf8');
    expect(pentest).toMatch(/rest\/v1\/probe_events/);
  });

  it('T154 no shipped app code records a probe shaped signer key', () => {
    const app = readFileSync(join(process.cwd(), 'src/lib/activity-record.server.ts'), 'utf8');
    expect(app).not.toMatch(/signer_key:\s*'(probe|test|scan|poc|fake)/i);
  });
});
