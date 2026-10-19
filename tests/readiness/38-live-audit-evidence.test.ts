import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyReport } from '@/lib/security-audit';

const state = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  prior: {} as Record<string, string>,
  today: null as {
    report_date: string;
    changes: DailyReport['changes'];
    manifest?: Record<string, string>;
  } | null,
  committed: null as DailyReport | null,
  error: null as object | null,
  upsert: vi.fn(async () => ({ error: null })),
}));
vi.mock('@/lib/audit-watch.server', () => ({
  deployedManifest: async () => state.files,
  areaFor: () => 'auth',
}));
vi.mock('@/lib/security-audit', () => ({ findReport: () => state.committed }));
vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        lt: () => ({
          order: () => ({
            limit: async () => ({ data: [{ manifest: state.prior }], error: null }),
          }),
        }),
        eq: () => ({ maybeSingle: async () => ({ data: state.today, error: state.error }) }),
      }),
      upsert: state.upsert,
    }),
  },
}));
import { reportCalendarDay } from '@/lib/report-calendar';
import { generateDailyReport } from '@/lib/security-reports.server';

beforeEach(() => {
  state.files = { 'existing.ts': 'baseline', 'new.ts': 'new' };
  state.prior = { 'existing.ts': 'baseline' };
  state.today = null;
  state.committed = null;
  state.error = null;
  state.upsert.mockClear();
});

describe('live audit evidence', () => {
  it('uses now-watched wording when only expanding observation', async () => {
    const report = await generateDailyReport('audit.md');
    expect(report.headline).toContain('now watched');
    expect(report.summary).toContain('Nothing already under watch changed today');
  });
  it('retains a prior same-day change even after that file is reverted', async () => {
    const priorChange = { path: 'existing.ts', kind: 'modified' as const, area: 'auth' };
    state.today = { report_date: reportCalendarDay(), changes: [priorChange] };
    const report = await generateDailyReport('audit.md');
    expect(report.changes).toContainEqual(priorChange);
    expect(report.changes).toContainEqual({ path: 'new.ts', kind: 'now watched', area: 'auth' });
    expect(state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ changes: report.changes }),
      { onConflict: 'report_date' },
    );
  });
  it('seeds the first live run with the shipped same-day report', async () => {
    const shipped = { path: 'shipped.ts', kind: 'modified' as const, area: 'auth' };
    state.committed = {
      date: reportCalendarDay(),
      changes: [shipped],
    } as DailyReport;
    const report = await generateDailyReport('audit.md');
    expect(report.changes).toContainEqual(shipped);
  });
  it('does not describe a watch-only expansion as changed source', async () => {
    state.prior = { 'existing.ts': 'baseline' };
    state.files = { 'existing.ts': 'baseline', 'new.ts': 'new' };
    const report = await generateDailyReport('audit.md');
    expect(report.headline).toBe('1 more file is now watched every day.');
    expect(report.summary).toBe(
      '1 more file is now watched every day, covering auth. Nothing already under watch changed today.',
    );
  });

  it('refuses to overwrite evidence when reading today fails', async () => {
    state.error = { message: 'synthetic database outage' };
    await expect(generateDailyReport('audit.md')).rejects.toThrow('Could not read');
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it('records restoration after same-day removal even at the prior-day hash', async () => {
    state.files = { 'existing.ts': 'baseline' };
    state.today = {
      report_date: reportCalendarDay(),
      changes: [{ path: 'existing.ts', kind: 'removed', area: 'auth' }],
      manifest: {},
    };
    expect((await generateDailyReport('audit.md')).changes).toEqual([
      { path: 'existing.ts', kind: 'modified', area: 'auth' },
    ]);
  });
  it('records removal when a newly watched file is rolled back', async () => {
    state.files = { 'existing.ts': 'baseline' };
    state.today = {
      report_date: reportCalendarDay(),
      changes: [{ path: 'new.ts', kind: 'now watched', area: 'auth' }],
      manifest: { 'existing.ts': 'baseline', 'new.ts': 'new' },
    };
    expect((await generateDailyReport('audit.md')).changes).toEqual([
      { path: 'new.ts', kind: 'removed', area: 'auth' },
    ]);
  });
  it('does not let shipped history resurrect a removed file on an unchanged rerun', async () => {
    state.files = { 'existing.ts': 'baseline' };
    state.committed = {
      date: reportCalendarDay(),
      changes: [{ path: 'new.ts', kind: 'now watched', area: 'auth' }],
    } as DailyReport;
    state.today = {
      report_date: reportCalendarDay(),
      changes: [{ path: 'new.ts', kind: 'removed', area: 'auth' }],
      manifest: { 'existing.ts': 'baseline' },
    };
    expect((await generateDailyReport('audit.md')).changes).toEqual([
      { path: 'new.ts', kind: 'removed', area: 'auth' },
    ]);
  });
});
