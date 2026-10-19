/**
 * Reads the security material that ships with the app: the latest full audit
 * and the daily code reports written by scripts/daily-audit.ts. Everything is
 * bundled at build time, so the security center works offline and never
 * depends on a third-party API being up.
 */
import fullAuditRaw from '../../docs/security/2026-08-31-full-security-audit.md?raw';
import { reportText } from './daily-report-changes';

export type AuditVerdict = {
  id: string;
  area: string;
  verdict: string;
  evidence: string;
};

export type DailyReport = {
  date: string;
  generatedAt: string;
  status: 'unchanged' | 'changed' | 'baseline';
  headline: string;
  summary: string;
  filesWatched: number;
  changes: { path: string; kind: 'added' | 'modified' | 'removed' | 'now watched'; area: string }[];
  areas: string[];
  fullAudit: string;
};

export const FULL_AUDIT_DATE = '2026-08-31';
export const FULL_AUDIT_FILE = `docs/security/${FULL_AUDIT_DATE}-full-security-audit.md`;
/** The full audit is published on this site, so nobody needs a code host to read it. */
export const FULL_AUDIT_URL = '/security/audit';
/** The raw report text, rendered in full on the audit page. */
export const FULL_AUDIT_TEXT = fullAuditRaw;

/** Turns the markdown verdict table into rows the page can render. */
function parseVerdicts(markdown: string): AuditVerdict[] {
  const rows: AuditVerdict[] = [];
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*([A-Z]\d)\s*\|(.+)\|(.+)\|(.+)\|\s*$/.exec(line.trim());
    if (!match) continue;
    const [, id, area, verdict, evidence] = match;
    if (!id || !area || !verdict || !evidence) continue;
    rows.push({
      id,
      area: area.trim(),
      verdict: verdict.trim(),
      evidence: evidence.trim().replace(/`/g, ''),
    });
  }
  return rows;
}

export const AUDIT_VERDICTS: AuditVerdict[] = parseVerdicts(fullAuditRaw);

export const AUDIT_TOTALS = {
  checks: AUDIT_VERDICTS.length,
  passed: AUDIT_VERDICTS.filter((row) => row.verdict === 'PASS').length,
  fixed: AUDIT_VERDICTS.filter((row) => row.verdict === 'FIXED').length,
  /** Reviewed, understood and deliberately accepted. Not an unresolved problem. */
  accepted: AUDIT_VERDICTS.filter((row) => row.verdict === 'ACCEPTED').length,
  open: AUDIT_VERDICTS.filter(
    (row) => row.verdict !== 'PASS' && row.verdict !== 'FIXED' && row.verdict !== 'ACCEPTED',
  ).length,
};

/** The scope headings of the audit, in words a non-developer can follow. */
export const AUDIT_AREAS: { title: string; note: string }[] = [
  {
    title: 'Encryption and passwords',
    note: 'Your vault is sealed with AES-GCM and a password stretched with Argon2id. The unlock key is never extractable from the browser.',
  },
  {
    title: 'Key isolation',
    note: 'Unlocked signing keys exist only inside an isolated worker. The page you look at never receives them.',
  },
  {
    title: 'Recovery phrase containment',
    note: 'A browser sweep after revealing a phrase found no copy in storage, cookies, the page, memory or any network request.',
  },
  {
    title: 'Browser hardening',
    note: 'A strict content policy, HSTS, no referrers and a minimal permissions policy, all pinned by automated tests.',
  },
  {
    title: 'Sessions and sign-out',
    note: 'Locking one tab locks the others, and signing out clears the session everywhere before it navigates.',
  },
  {
    title: 'Backend trust boundary',
    note: 'Every database table has row-level security, writes are scoped to your own profile, and the public counters cannot be forged.',
  },
];

const reportModules = import.meta.glob<DailyReport>('../../docs/security/reports/*.json', {
  eager: true,
  import: 'default',
});

/** Newest first. The manifest and index files are not reports, so they are skipped. */
export const DAILY_REPORTS: DailyReport[] = Object.entries(reportModules)
  .filter(([path]) => /\/\d{4}-\d{2}-\d{2}\.json$/.test(path))
  .map(([, report]) => report)
  .sort((a, b) => b.date.localeCompare(a.date));

export const LATEST_REPORT: DailyReport | null = DAILY_REPORTS[0] ?? null;

export { daysBehindReport } from './daily-report';
export { formatGeneratedAt, formatReportDate, formatReportDateShort } from './report-calendar';

/** Every daily report has a permanent URL, so it can be linked to and read later. */
export function reportUrl(date: string): string {
  return `/security/reports/${date}`;
}

export function findReport(date: string): DailyReport | null {
  return DAILY_REPORTS.find((report) => report.date === date) ?? null;
}

export type ReportStatus = {
  tone: 'clear' | 'changed' | 'finding';
  headline: string;
  summary: string;
  linkLabel: string;
  url: string;
};

/**
 * Turns a daily report plus the open-finding count into the wording the card and
 * the article share, so a change or a finding is never softened into vagueness.
 */
export function describeReport(
  report: DailyReport,
  openFindings = AUDIT_TOTALS.open,
): ReportStatus {
  const url = reportUrl(report.date);
  const wording = reportText(
    report.status === 'baseline' ? 'baseline' : 'changed',
    report.changes,
    report.areas,
  );
  const modified = report.changes.filter((change) => change.kind !== 'now watched').length;
  if (openFindings > 0) {
    return {
      tone: 'finding',
      headline:
        openFindings === 1
          ? 'A security finding requires attention.'
          : `${openFindings} security findings require attention.`,
      summary: wording.summary,
      linkLabel: 'Review the security report',
      url,
    };
  }
  if (report.changes.length > 0) {
    return {
      tone: 'changed',
      headline: wording.headline,
      summary: wording.summary,
      linkLabel: modified > 0 ? 'See what changed' : 'See what is newly watched',
      url,
    };
  }
  return {
    tone: 'clear',
    headline: wording.headline,
    summary: wording.summary,
    linkLabel: "Read today's code report",
    url,
  };
}
