import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { copyText } from './primitives';
import { LEGAL_CONTACT_EMAIL } from './SiteFooter';

export function contactMailto(subject?: string): string {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${LEGAL_CONTACT_EMAIL}${query}`;
}

/** Inline address that opens the contact page instead of a mail app. */
export function ContactEmailLink({ topic }: { topic?: 'security' }) {
  return (
    <Link to="/contact" search={topic ? { topic } : {}}>
      {LEGAL_CONTACT_EMAIL}
    </Link>
  );
}

/**
 * Shows the inbox and a copy action. mailto alone fails on many phones and
 * desktops that have no mail app installed.
 */
export function ContactActions({ subject }: { subject?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void copyText(LEGAL_CONTACT_EMAIL);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="contact-actions">
      <p className="contact-email">{LEGAL_CONTACT_EMAIL}</p>
      <div className="card-actions">
        <button type="button" className="button button--accent" onClick={copy}>
          {copied ? 'Copied' : 'Copy email'}
        </button>
        <a className="button button--secondary" href={contactMailto(subject)}>
          Open in your email app
        </a>
      </div>
    </div>
  );
}
