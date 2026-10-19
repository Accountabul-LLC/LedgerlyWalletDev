import { createFileRoute, Link } from '@tanstack/react-router';
import { SiteHeader } from '@/ledgerly/ui/components/SiteHeader';
import { SiteFooter } from '@/ledgerly/ui/components/SiteFooter';
import { changeCounts } from '@/lib/daily-report-changes';
import {
  AUDIT_AREAS,
  AUDIT_TOTALS,
  AUDIT_VERDICTS,
  FULL_AUDIT_DATE,
  FULL_AUDIT_FILE,
  daysBehindReport,
  describeReport,
  formatReportDate,
} from '@/lib/security-audit';
import { getDailyReports } from '@/lib/security-reports.functions';

import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/security-center')({
  head: () => ({
    meta: [
      { title: 'Security Center — Ledgerly Wallet Audit and Daily Code Report' },
      {
        name: 'description',
        content:
          'Read the latest Ledgerly security audit, the daily report on what changed in the code that protects your keys, and the parts of the wallet you can audit yourself.',
      },
      { property: 'og:title', content: 'Ledgerly Security Center' },
      {
        property: 'og:description',
        content:
          'The latest wallet security audit, a daily what-changed report, and the code you can audit yourself.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://ledgerlywallet.com/security-center' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://ledgerlywallet.com/security-center' }],
  }),
  loader: () => getDailyReports(),
  component: SecurityCenter,
});

function verdictClass(verdict: string): string {
  if (verdict === 'PASS') return 'audit-verdict is-pass';
  if (verdict === 'FIXED') return 'audit-verdict is-fixed';
  return 'audit-verdict is-open';
}

function activityLabel(report: {
  status: string;
  changes: { path: string; kind: 'added' | 'modified' | 'removed' | 'now watched'; area: string }[];
}): string {
  if (report.status === 'baseline') return 'Baseline';
  const counts = changeCounts(report.changes);
  if (counts.modified > 0) return 'Changed';
  if (counts.newlyWatched > 0) return 'Now watched';
  return 'No change';
}

function SecurityCenter() {
  const reports = Route.useLoaderData();
  const latest = reports[0] ?? null;
  const status = latest ? describeReport(latest) : null;
  const counts = latest ? changeCounts(latest.changes) : null;
  const history = reports.slice(0, 14);

  return (
    <div className="shell">
      <SiteHeader />

      <main className="landing security-center">
        <section className="landing-hero">
          <span className="card-eyebrow">Security center</span>
          <h1>Check our security, any day you like</h1>
          <p className="landing-lede">
            Ledgerly holds nothing of yours, so the only thing worth trusting is the code. Here is
            the latest full audit, a daily report on whether the protective code moved, and the
            parts of the wallet you can read for yourself.
          </p>
        </section>

        <section className="card card--feature audit-status" aria-label="Latest daily code report">
          <span className="card-eyebrow">Daily code report</span>
          {latest && status ? (
            <>
              <div className="daily-report-copy">
                {status.headline ? (
                  <h2 className="card-title">
                    <Link to="/security/reports/$date" params={{ date: latest.date }}>
                      {status.headline} <span aria-hidden="true">→</span>
                    </Link>
                  </h2>
                ) : null}
                <p className="card-note daily-report-description">{status.summary}</p>
              </div>
              <dl
                className="landing-stats daily-report-stats"
                aria-label="Latest report at a glance"
              >
                <div className="landing-stat stat-cube">
                  <strong className="landing-stat-value">{formatReportDate(latest.date)}</strong>
                  <dt>Last checked</dt>
                </div>
                <div className="landing-stat stat-cube">
                  <strong className="landing-stat-value">{latest.filesWatched}</strong>
                  <dt>Files watched</dt>
                </div>
                <div className="landing-stat stat-cube">
                  <strong className="landing-stat-value">{counts?.modified ?? 0}</strong>
                  <dt>Changes since last report</dt>
                </div>
                <div className="landing-stat stat-cube">
                  <strong className="landing-stat-value">{counts?.newlyWatched ?? 0}</strong>
                  <dt>Newly watched</dt>
                </div>
                <div
                  className={`landing-stat stat-cube${AUDIT_TOTALS.open > 0 ? ' is-alert' : ''}`}
                >
                  <strong className="landing-stat-value">{AUDIT_TOTALS.open}</strong>
                  <dt>Open findings</dt>
                </div>
              </dl>
              <Link
                to="/security/reports/$date"
                params={{ date: latest.date }}
                className="daily-report-link"
              >
                {status.linkLabel} <span aria-hidden="true">→</span>
              </Link>
              {daysBehindReport(latest.date) >= 2 ? (
                <p className="card-note" role="status">
                  This is the latest published snapshot. A newer daily check has not been published
                  yet, so the number above is days old rather than a claim that nothing in the
                  wallet moved.
                </p>
              ) : null}
            </>
          ) : (
            <p className="card-note">
              The first daily report is being generated. The full audit below is current.
            </p>
          )}
        </section>

        <section className="card card--plain" aria-label="Latest full security audit">
          <span className="card-eyebrow">Full audit</span>
          <h2 className="card-title">Audit of {formatReportDate(FULL_AUDIT_DATE)}</h2>
          <p className="card-note">
            {AUDIT_TOTALS.passed} of {AUDIT_TOTALS.checks} checks passed as written,{' '}
            {AUDIT_TOTALS.fixed} {AUDIT_TOTALS.fixed === 1 ? 'was' : 'were'} fixed during the audit,{' '}
            {AUDIT_TOTALS.accepted} {AUDIT_TOTALS.accepted === 1 ? 'was' : 'were'} reviewed and
            accepted on purpose, and {AUDIT_TOTALS.open} remain open. One thing stays outstanding on
            purpose: an independent third-party penetration test. Everything here is our own review,
            and we say so rather than dressing it up.
          </p>

          <div className="card-actions">
            <Link to="/security/audit" className="button button--secondary">
              Read the full report
            </Link>
          </div>

          <details className="audit-details">
            <summary>
              What we checked, area by area{' '}
              <span className="inline-note">({AUDIT_AREAS.length} areas)</span>
            </summary>
            <div className="audit-areas">
              {AUDIT_AREAS.map((area) => (
                <article key={area.title} className="audit-area">
                  <h3 className="card-title">{area.title}</h3>
                  <p className="card-note">{area.note}</p>
                </article>
              ))}
            </div>
          </details>

          <details className="audit-details">
            <summary>
              Every individual check and its evidence{' '}
              <span className="inline-note">({AUDIT_TOTALS.checks} checks)</span>
            </summary>
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th scope="col">Check</th>
                    <th scope="col">Area</th>
                    <th scope="col">Result</th>
                    <th scope="col">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIT_VERDICTS.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.id}</th>
                      <td>{row.area}</td>
                      <td>
                        <span className={verdictClass(row.verdict)}>{row.verdict}</span>
                      </td>
                      <td className="audit-evidence">{row.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="inline-note">Full report: {FULL_AUDIT_FILE}</p>
        </section>

        {history.length > 1 ? (
          <section className="card card--plain" aria-label="Recent daily reports">
            <span className="card-eyebrow">History</span>
            <h2 className="card-title">Recent daily reports</h2>
            <ul className="audit-history">
              {history.map((report) => {
                const label = activityLabel(report);
                const described = describeReport(report);
                return (
                  <li key={report.date}>
                    <span
                      className={`audit-verdict is-${label === 'Changed' ? 'changed' : report.status === 'baseline' ? 'baseline' : 'unchanged'}`}
                    >
                      {label}
                    </span>
                    <strong>
                      <Link to="/security/reports/$date" params={{ date: report.date }}>
                        {formatReportDate(report.date)}
                      </Link>
                    </strong>

                    {described.headline ? (
                      <span className="inline-note">{described.headline}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section
          className="card card--plain audit-open-source"
          aria-label="Audit our code yourself"
        >
          <span className="card-eyebrow">Open source</span>
          <h2 className="card-title">Audit our code yourself</h2>
          <p className="card-note">
            The code that holds your keys is published: key generation, encryption, the vault
            format, transaction building, signing, the isolated worker and the extension shell.
            Every publish ships a checksum list and is tagged to a released version, so you can
            compare what you installed against what we published. Our servers, analytics and
            deployment stay private, and they never receive a key, a recovery phrase or a password.
          </p>
          <div className="card-actions">
            <Link to="/security" className="button button--accent">
              How we handle keys
            </Link>
            <Link to="/security/audit" className="button button--accent">
              Read the full audit
            </Link>
            <Link to="/contact" search={{ topic: 'security' }} className="button button--secondary">
              Report a security issue
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
