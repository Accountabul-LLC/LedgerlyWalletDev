/**
 * Public read path for the daily code reports.
 *
 * The homepage, security center and report article all call this. Published
 * database rows overlay the bundled git reports when they were generated
 * later; every other day stays on the bundled report. The repository history
 * has to remain visible because production currently stores a single stale
 * row and cannot append another until the deployment is unpaused.
 */
import { createServerFn } from '@tanstack/react-start';
import { DAILY_REPORTS, type DailyReport } from './security-audit';
import { mergeDailyReports } from './daily-report';

export { mergeDailyReports };

export const getDailyReports = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DailyReport[]> => {
    try {
      const { readPublishedReports } = await import('./security-reports.server');
      return mergeDailyReports(DAILY_REPORTS, await readPublishedReports());
    } catch {
      return DAILY_REPORTS;
    }
  },
);
