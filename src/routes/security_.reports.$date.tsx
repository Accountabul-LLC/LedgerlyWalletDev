import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import {
  BookOpen,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  Code2,
  FileCode2,
  FileText,
  ShieldCheck,
} from 'lucide-react';

import { SiteHeader } from '@/ledgerly/ui/components/SiteHeader';
import { SiteFooter } from '@/ledgerly/ui/components/SiteFooter';
import { changeCounts } from '@/lib/daily-report-changes';
import {
  AUDIT_TOTALS,
  describeReport,
  findReport,
  formatGeneratedAt,
  formatReportDate,
} from '@/lib/security-audit';
import { getDailyReports } from '@/lib/security-reports.functions';

import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/security_/reports/$date')({
  loader: async ({ params }) => {
    const reports = await getDailyReports();
    const report = reports.find((entry) => entry.date === params.date) ?? findReport(params.date);
    if (!report) throw notFound();
    return report;
  },
  head: ({ params }) => {
    const title = `Daily code report, ${params.date} — Ledgerly`;
    const description = `What the automated Ledgerly audit checked on ${params.date}, and whether any code that protects your keys changed.`;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'article' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [
        {
          rel: 'canonical',
          href: `https://ledgerlywallet.com/security/reports/${params.date}`,
        },
      ],
    };
  },
  component: DailyReportArticle,
  notFoundComponent: () => (
    <div className="shell">
      <SiteHeader />
      <main className="landing security-center">
        <section className="card card--plain">
          <h1 className="card-title">That report does not exist</h1>
          <p className="card-note">
            We publish one code report a day. Pick one from the security center.
          </p>
          <div className="card-actions">
            <Link to="/security-center" className="button button--secondary">
              Back to the security center
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  ),
});

function DailyReportArticle() {
  const report = Route.useLoaderData();
  const status = describeReport(report);
  const counts = changeCounts(report.changes);
  const modified = report.changes.filter((change) => change.kind !== 'now watched');
  const watched = report.changes.filter((change) => change.kind === 'now watched');

  return (
    <div className="shell">
      <SiteHeader />

      <main className="landing security-center">
        <section className="landing-hero">
          <span className="card-eyebrow">Daily code report</span>
          <h1>{status.headline || `Daily code report for ${formatReportDate(report.date)}`}</h1>
          <p className="landing-lede">{status.summary}</p>
          <p className="inline-note">Checked {formatReportDate(report.date)}</p>
        </section>

        <section className="card card--plain" aria-label="What changed">
          <h2 className="card-title">What changed</h2>
          {modified.length ? (
            <>
              <p className="card-note">
                {counts.modified} {counts.modified === 1 ? 'file was' : 'files were'} modified
                today.
              </p>
              <ul className="audit-change-list">
                {modified.map((change) => (
                  <li key={change.path}>
                    <span className="audit-change-area">{change.area}</span>
                    <code>{change.path}</code>
                    <span className="inline-note">{change.kind}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="card-note">
              Nothing. Not one of the {report.filesWatched} watched files changed since the previous
              report.
            </p>
          )}
        </section>

        <section className="card card--plain" aria-label="Newly watched">
          <h2 className="card-title">Newly watched</h2>
          {watched.length ? (
            <>
              <p className="card-note">
                {counts.newlyWatched} more {counts.newlyWatched === 1 ? 'file is' : 'files are'} now
                watched every day. Joining the watch list is not a change to code that was already
                watched.
              </p>
              <ul className="audit-change-list">
                {watched.map((change) => (
                  <li key={change.path}>
                    <span className="audit-change-area">{change.area}</span>
                    <code>{change.path}</code>
                    <span className="inline-note">{change.kind}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="card-note">No file joined the watch list today.</p>
          )}
        </section>

        <section className="card card--plain" aria-label="Does this affect your keys">
          <h2 className="card-title">Does this affect your keys?</h2>
          <p className="card-note">
            {modified.length
              ? 'Read the areas listed above. Anything outside key generation, encryption or recovery phrase handling cannot reach your secrets, because those live only inside the isolated worker on your device.'
              : 'No. Key generation, encryption and recovery phrase handling were unchanged, and your wallet behaves exactly as it did in the last published audit.'}
          </p>
          {AUDIT_TOTALS.open > 0 ? (
            <p className="card-note">
              {AUDIT_TOTALS.open} finding{AUDIT_TOTALS.open === 1 ? '' : 's'} from the full audit
              {AUDIT_TOTALS.open === 1 ? ' is' : ' are'} still open. The full report names each one.
            </p>
          ) : null}
        </section>

        <section className="card card--plain tech-details" aria-label="Technical details">
          <header className="tech-details-head">
            <span className="tech-icon tech-icon--lead" aria-hidden="true">
              <ShieldCheck size={22} strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="card-title">Technical details</h2>
              <p className="card-note">Overview of this security audit and scan information.</p>
            </div>
          </header>

          <dl className="tech-facts">
            {[
              {
                icon: <CalendarDays size={18} strokeWidth={1.8} />,
                label: 'Date checked',
                value: formatReportDate(report.date),
              },
              {
                icon: <Clock size={18} strokeWidth={1.8} />,
                label: 'Generated at',
                value: formatGeneratedAt(report.generatedAt),
              },
              {
                icon: <FileText size={18} strokeWidth={1.8} />,
                label: 'Files watched',
                value: report.filesWatched,
              },
              {
                icon: <ClipboardCheck size={18} strokeWidth={1.8} />,
                label: 'Audit checks',
                value: AUDIT_TOTALS.checks,
              },
              {
                icon: <Code2 size={18} strokeWidth={1.8} />,
                label: 'Files changed',
                value: counts.modified,
              },
              {
                icon: <FileCode2 size={18} strokeWidth={1.8} />,
                label: 'Newly watched',
                value: counts.newlyWatched,
              },
              {
                icon: <FileCode2 size={18} strokeWidth={1.8} />,
                label: 'Latest full audit',
                value: report.fullAudit,
              },
            ].map((row) => (
              <div className="tech-fact" key={row.label}>
                <span className="tech-icon" aria-hidden="true">
                  {row.icon}
                </span>
                <div className="tech-fact-body">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              </div>
            ))}
          </dl>

          {AUDIT_TOTALS.open === 0 ? (
            <div className="tech-callout">
              <span className="tech-icon tech-icon--good" aria-hidden="true">
                <Check size={18} strokeWidth={2.2} />
              </span>
              <div>
                <strong>All critical issues have been resolved</strong>
                <p>The latest audit shows no outstanding critical or high severity issues.</p>
              </div>
            </div>
          ) : null}

          <div className="tech-actions">
            <Link to="/security/audit" className="tech-action tech-action--primary">
              <BookOpen size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>
                <strong>Read the full audit</strong>
                <small>View complete report</small>
              </span>
            </Link>
            <Link to="/security-center" className="tech-action">
              <ShieldCheck size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>
                <strong>Back to security center</strong>
                <small>Return to overview</small>
              </span>
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
