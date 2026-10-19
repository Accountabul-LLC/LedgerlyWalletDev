export type DatedReport = {
  date: string;
  generatedAt: string;
};

/**
 * One read path for the public Security Center.
 *
 * Published database rows and the reports bundled from git share dates.
 * The newer generatedAt wins for a date, so a stale database row cannot hide
 * a later snapshot that shipped in the app, and a later live check can still
 * replace an older bundled copy of the same day. Dates the database does not
 * have stay on the bundled report. That fallback is required while production
 * holds a single stale row and the deployment that should append the next
 * one is paused.
 */
export function mergeDailyReports<T extends DatedReport>(bundled: T[], published: T[]): T[] {
  const byDate = new Map<string, T>();
  const pick = (report: T) => {
    const existing = byDate.get(report.date);
    if (!existing || report.generatedAt > existing.generatedAt) {
      byDate.set(report.date, report);
    }
  };
  for (const report of bundled) pick(report);
  for (const report of published) pick(report);
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export { daysBehindReport } from './report-calendar';
