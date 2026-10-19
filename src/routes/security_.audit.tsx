/**
 * The full security audit, published on this site.
 *
 * The report is bundled at build time, so anyone can read every check and its
 * evidence here without visiting a code host or trusting a summary.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { SiteHeader } from '@/ledgerly/ui/components/SiteHeader';
import { SiteFooter } from '@/ledgerly/ui/components/SiteFooter';
import {
  AUDIT_TOTALS,
  FULL_AUDIT_DATE,
  FULL_AUDIT_TEXT,
  formatReportDate,
} from '@/lib/security-audit';

import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/security_/audit')({
  head: () => {
    const title = `Full security audit, ${FULL_AUDIT_DATE} — Ledgerly Wallet`;
    const description =
      'Every check in the latest Ledgerly security audit, its result and its evidence, published in full on this page.';
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: 'Ledgerly full security audit' },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'article' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [{ rel: 'canonical', href: 'https://ledgerlywallet.com/security/audit' }],
    };
  },
  component: FullAudit,
});

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

/** Turns the report markdown into the small set of blocks this page renders. */
function parse(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', text: clean(paragraph.join(' ')) });
      paragraph = [];
    }
    if (items.length) {
      blocks.push({ kind: 'list', items: items.map(clean) });
      items = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'heading', level: 2, text: clean(line.slice(3)) });
      continue;
    }
    if (line.startsWith('### ')) {
      flush();
      blocks.push({ kind: 'heading', level: 3, text: clean(line.slice(4)) });
      continue;
    }
    if (line.startsWith('- ')) {
      if (paragraph.length) flush();
      items.push(line.slice(2));
      continue;
    }
    if (line.startsWith('|')) {
      flush();
      const table: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        const cells = (lines[i] ?? '')
          .trim()
          .slice(1, -1)
          .split('|')
          .map((cell) => clean(cell.trim()));
        if (!cells.every((cell) => /^-{2,}$/.test(cell))) table.push(cells);
        i += 1;
      }
      const [head, ...rows] = table;
      if (head) blocks.push({ kind: 'table', head, rows });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

function clean(text: string): string {
  return text.replace(/`/g, '').replace(/\*\*/g, '');
}

function isVerdict(cell: string): boolean {
  return /^(PASS|FIXED|ACCEPTED|OPEN)$/.test(cell);
}

function verdictClass(verdict: string): string {
  if (verdict === 'PASS') return 'audit-verdict is-pass';
  if (verdict === 'FIXED') return 'audit-verdict is-fixed';
  if (verdict === 'ACCEPTED') return 'audit-verdict is-unchanged';
  return 'audit-verdict is-open';
}

const BLOCKS = parse(FULL_AUDIT_TEXT);

function FullAudit() {
  return (
    <div className="shell">
      <SiteHeader />

      <main className="landing security-center">
        <section className="landing-hero">
          <span className="card-eyebrow">Full audit</span>
          <h1>Security audit of {formatReportDate(FULL_AUDIT_DATE)}</h1>
          <p className="landing-lede">
            {AUDIT_TOTALS.passed} of {AUDIT_TOTALS.checks} checks passed as written,{' '}
            {AUDIT_TOTALS.fixed} {AUDIT_TOTALS.fixed === 1 ? 'was' : 'were'} fixed during the audit,{' '}
            {AUDIT_TOTALS.accepted} {AUDIT_TOTALS.accepted === 1 ? 'was' : 'were'} reviewed and
            accepted on purpose, and {AUDIT_TOTALS.open} remain open. The whole report is below,
            word for word.
          </p>
        </section>

        <section className="card card--plain" aria-label="Full audit report">
          {BLOCKS.map((block, index) => {
            if (block.kind === 'heading') {
              return block.level === 2 ? (
                <h2 key={index} className="card-title">
                  {block.text}
                </h2>
              ) : (
                <h3 key={index} className="card-title">
                  {block.text}
                </h3>
              );
            }
            if (block.kind === 'paragraph') {
              return (
                <p key={index} className="card-note">
                  {block.text}
                </p>
              );
            }
            if (block.kind === 'list') {
              return (
                <ul key={index} className="audit-change-list">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              );
            }
            return (
              <div key={index} className="audit-block">
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        {block.head.map((cell) => (
                          <th key={cell} scope="col">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row) => (
                        <tr key={row.join('|')}>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex}>
                              {isVerdict(cell) ? (
                                <span className={verdictClass(cell)}>{cell}</span>
                              ) : (
                                cell
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="audit-entries">
                  {block.rows.map((row) => {
                    // A leading short code such as "F5" is a label, not a heading.
                    const codeFirst = (row[0] ?? '').length <= 4 && row.length > 2;
                    const title = codeFirst ? `${row[0]} · ${row[1]}` : row[0];
                    const rest = row.slice(codeFirst ? 2 : 1);
                    const labelOffset = codeFirst ? 2 : 1;
                    return (
                      <li key={row.join('|')} className="audit-entry">
                        <h4 className="audit-entry-title">{title}</h4>
                        {rest.map((cell, cellIndex) => (
                          <div key={cellIndex} className="audit-entry-field">
                            {isVerdict(cell) ? (
                              <span className={verdictClass(cell)}>{cell}</span>
                            ) : (
                              <>
                                <span className="audit-entry-label">
                                  {block.head[cellIndex + labelOffset] ?? ''}
                                </span>
                                <p className="audit-entry-text">{cell}</p>
                              </>
                            )}
                          </div>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="card card--plain">
          <div className="card-actions">
            <Link to="/security-center" className="button button--secondary">
              Back to the security center
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
