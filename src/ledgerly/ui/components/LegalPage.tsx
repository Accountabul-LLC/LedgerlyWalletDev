import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter, LEGAL_UPDATED } from './SiteFooter';

/**
 * Shared shell for the policy pages so Terms, Privacy, Risk and Security all
 * read the same and keep the global header and footer.
 */
export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <SiteHeader />
      <main className="legal-page">
        <header className="legal-head">
          <span className="card-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="landing-lede">{intro}</p>
          <p className="inline-note">Last updated {LEGAL_UPDATED}</p>
        </header>
        <article className="card card--plain legal-body">{children}</article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{heading}</h2>
      {children}
    </section>
  );
}
