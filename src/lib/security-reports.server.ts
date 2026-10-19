/**
 * Builds and stores the daily code report from the deployed build.
 *
 * The wording matches scripts/daily-audit.ts exactly, so the published report
 * and the one committed to the audit repository read the same way.
 */
import committedManifest from '../../docs/security/reports/manifest.json';
import { areaFor, deployedManifest } from './audit-watch.server';
import { findReport, type DailyReport } from './security-audit';
import { cumulativeChanges, reportText } from './daily-report-changes';
import { reportCalendarDay } from './report-calendar';

/**
 * The last fingerprint committed to the audit repository. It is the baseline the
 * first live report compares against, so the history never restarts from zero
 * just because the reports moved from the repository to the running site.
 */
const COMMITTED_BASELINE = (committedManifest as { files: Record<string, string> }).files;

type Row = {
  report_date: string;
  generated_at: string;
  status: DailyReport['status'];
  headline: string;
  summary: string;
  files_watched: number;
  changes: DailyReport['changes'];
  areas: string[];
  full_audit: string;
  manifest?: Record<string, string>;
};

export function rowToReport(row: Row): DailyReport {
  return {
    date: row.report_date,
    generatedAt: row.generated_at,
    status: row.status,
    headline: row.headline,
    summary: row.summary,
    filesWatched: row.files_watched,
    changes: row.changes ?? [],
    areas: row.areas ?? [],
    fullAudit: row.full_audit,
  };
}

/** Writes today's report if the deployed code fingerprint has anything to say. */
export async function generateDailyReport(fullAuditFile: string): Promise<DailyReport> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const files = await deployedManifest();
  const date = reportCalendarDay();

  const { data: previousRows, error: previousError } = await supabaseAdmin
    .from('security_reports')
    .select('report_date, manifest')
    .lt('report_date', date)
    .order('report_date', { ascending: false })
    .limit(1);
  if (previousError) throw new Error('Could not read the audit baseline.');

  const { data: today, error: todayError } = await supabaseAdmin
    .from('security_reports')
    .select('report_date, changes, manifest')
    .eq('report_date', date)
    .maybeSingle();
  if (todayError) throw new Error('Could not read today’s audit evidence.');

  const stored = (previousRows?.[0]?.manifest ?? null) as Record<string, string> | null;
  const todayRow = today as Pick<Row, 'report_date' | 'changes' | 'manifest'> | null;
  // Diff against a published fingerprint. An earlier row from today is that
  // day's last published manifest. Otherwise use the previous day's published
  // manifest. The copy bundled with this build is only the fallback for a
  // database that has never stored one, and preview deployments never call
  // this writer.
  const publishedPrevious = stored && Object.keys(stored).length > 0 ? stored : null;
  const previous = todayRow?.manifest ?? publishedPrevious ?? COMMITTED_BASELINE;
  const hasBaseline =
    todayRow?.manifest != null || publishedPrevious != null || Object.keys(previous).length > 0;

  let changes: DailyReport['changes'] = [];
  if (hasBaseline) {
    for (const [path, hash] of Object.entries(files)) {
      const before = previous[path];
      if (before === undefined) changes.push({ path, kind: 'now watched', area: areaFor(path) });
      else if (before !== hash) changes.push({ path, kind: 'modified', area: areaFor(path) });
    }
    for (const path of Object.keys(previous)) {
      if (!(path in files)) changes.push({ path, kind: 'removed', area: areaFor(path) });
    }
  }
  // Start with shipped evidence so the first live run cannot erase today's
  // repository report, then retain any changes recorded by earlier live runs.
  const earlierChanges = cumulativeChanges(date, findReport(date), todayRow?.changes ?? []);
  changes = cumulativeChanges(date, { date, changes: earlierChanges }, changes);

  const modified = changes.filter((change) => change.kind !== 'now watched');
  const areas = [...new Set((modified.length ? modified : changes).map((change) => change.area))];
  const status: DailyReport['status'] = !hasBaseline
    ? 'baseline'
    : changes.length
      ? 'changed'
      : 'unchanged';

  const report: DailyReport = {
    date,
    generatedAt: new Date().toISOString(),
    status,
    ...reportText(status, changes, areas),
    filesWatched: Object.keys(files).length,
    changes,
    areas,
    fullAudit: fullAuditFile,
  };

  const { error } = await supabaseAdmin.from('security_reports').upsert(
    {
      report_date: report.date,
      generated_at: report.generatedAt,
      status: report.status,
      headline: report.headline,
      summary: report.summary,
      files_watched: report.filesWatched,
      changes: report.changes,
      areas: report.areas,
      full_audit: report.fullAudit,
      manifest: files,
    },
    { onConflict: 'report_date' },
  );
  if (error) throw new Error(error.message);

  return report;
}

/** Newest first. Read with the admin client so it works during prerender too. */
export async function readPublishedReports(limit = 60): Promise<DailyReport[]> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('security_reports')
    .select(
      'report_date, generated_at, status, headline, summary, files_watched, changes, areas, full_audit',
    )
    .order('report_date', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Row[]).map(rowToReport);
}
