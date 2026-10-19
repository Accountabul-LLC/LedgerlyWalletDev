import { describe, expect, it } from 'vitest';
import { cumulativeChanges, reportText } from '@/lib/daily-report-changes';

const old = { path: 'existing.ts', kind: 'modified' as const, area: 'auth' };
const added = { path: 'new.ts', kind: 'now watched' as const, area: 'auth' };
describe('same-day audit evidence', () => {
  it('distinguishes expanding observation from changing existing source', () => {
    const text = reportText('changed', [added], ['auth']);
    expect(text.headline).toContain('now watched');
    expect(text.summary).toContain('Nothing already under watch changed today');
    expect(text.summary).not.toContain('security-sensitive file changed');
  });
  it('describes mixed source changes as changes and leaves unchanged reports clear', () => {
    const mixed = reportText('changed', [old, added], ['auth']);
    expect(mixed.summary).toContain('1 security-sensitive file changed');
    expect(mixed.summary).toContain('1 more file is now watched every day');
    expect(mixed.summary).not.toContain('2 security-sensitive files changed');
    expect(mixed.headline).toBe('Changes in 1 area of the code that protects your keys.');
    expect(reportText('unchanged', [], []).headline).toBe('');
  });
  it('preserves earlier findings alongside newly watched files', () => {
    expect(
      cumulativeChanges('2026-10-14', { date: '2026-10-14', changes: [old] }, [added]),
    ).toEqual([old, added]);
  });
  it('does not erase a report on an unchanged rerun', () => {
    expect(cumulativeChanges('2026-10-14', { date: '2026-10-14', changes: [old] }, [])).toEqual([
      old,
    ]);
  });
  it('keeps newly watched classification after another same-day edit', () => {
    expect(
      cumulativeChanges('2026-10-14', { date: '2026-10-14', changes: [added] }, [
        { ...added, kind: 'modified' },
      ]),
    ).toEqual([added]);
  });
  it('starts a fresh list on another date', () => {
    expect(
      cumulativeChanges('2026-10-15', { date: '2026-10-14', changes: [old] }, [added]),
    ).toEqual([added]);
  });
  it('records removal and then recreation without a false removed label', () => {
    const removed = { ...old, kind: 'removed' as const };
    expect(
      cumulativeChanges('2026-10-14', { date: '2026-10-14', changes: [old] }, [removed]),
    ).toEqual([removed]);
    expect(
      cumulativeChanges('2026-10-14', { date: '2026-10-14', changes: [removed] }, [
        { ...old, kind: 'now watched' },
      ]),
    ).toEqual([old]);
  });
});
