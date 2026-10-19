import { expect, test } from 'vitest';
import { daysBehindReport, mergeDailyReports } from '@/lib/daily-report';
import { reportText } from '@/lib/daily-report-changes';
import { reportCalendarDay, formatGeneratedAt, formatReportDate } from '@/lib/report-calendar';
import { DAILY_REPORTS, describeReport, type DailyReport } from '@/lib/security-audit';
import index from '../../docs/security/reports/index.json';

const report = (date: string, generatedAt: string, summary: string): DailyReport => ({
  date,
  generatedAt,
  summary,
  status: 'unchanged',
  headline: '',
  filesWatched: 1,
  changes: [],
  areas: [],
  fullAudit: 'audit.md',
});

test('stale live rows cannot hide a newer bundled date or same-day snapshot', () => {
  const bundled = report('2026-10-15', '2026-10-15T12:00:00Z', 'bundled');
  const stale = report('2026-10-15', '2026-10-15T06:00:00Z', 'stale');
  const olderDay = report('2026-10-14', '2026-10-14T23:00:00Z', 'older');
  expect(mergeDailyReports([bundled], [stale, olderDay])).toEqual([bundled, olderDay]);
  const fresh = report('2026-10-15', '2026-10-15T18:00:00Z', 'fresh');
  expect(mergeDailyReports([bundled], [fresh])).toEqual([fresh]);
});

test('report dates use the America/Chicago calendar day', () => {
  expect(reportCalendarDay(new Date('2026-10-15T01:17:00.000Z'))).toBe('2026-10-14');
  expect(reportCalendarDay(new Date('2026-10-15T11:31:58.003Z'))).toBe('2026-10-15');
  expect(daysBehindReport('2026-10-13', new Date('2026-10-15T00:01:00Z'))).toBe(1);
  expect(daysBehindReport('2026-10-14', new Date('2026-10-15T01:17:00.000Z'))).toBe(0);
  expect(daysBehindReport('2026-10-15', new Date('2026-10-15T23:59:00Z'))).toBe(0);
  expect(daysBehindReport('invalid', new Date('2026-10-15T00:00:00Z'))).toBe(0);
  expect(formatReportDate('2026-10-14')).toBe('October 14, 2026 CT');
  expect(formatGeneratedAt('2026-10-15T01:17:00.000Z')).toBe('October 14, 2026, 8:17 PM CT');
});

test('the index, the report files, and the security center use the same wording', () => {
  expect(index).toHaveLength(DAILY_REPORTS.length);
  for (const entry of index) {
    const report = DAILY_REPORTS.find((item) => item.date === entry.date);
    expect(report, entry.date).toBeTruthy();
    if (!report) continue;
    const wording = reportText(
      report.status === 'baseline' ? 'baseline' : 'changed',
      report.changes,
      report.areas,
    );
    expect(entry.status).toBe(report.status);
    expect(entry.headline).toBe(report.headline);
    expect(report.headline).toBe(wording.headline);
    expect(report.summary).toBe(wording.summary);
    expect(describeReport(report, 0).headline).toBe(wording.headline);
    expect(describeReport(report, 0).summary).toBe(wording.summary);
  }
});

test('watch-list expansion keeps its explanation instead of claiming a code edit', () => {
  const watched = {
    ...report('2026-10-15', '2026-10-15T12:00:00Z', 'Watching more code'),
    status: 'changed' as const,
    headline: '1 more file is now watched every day.',
    changes: [{ path: 'src/new.ts', kind: 'now watched' as const, area: 'wallet code' }],
  };
  expect(describeReport(watched, 0).headline).toBe(watched.headline);
});
