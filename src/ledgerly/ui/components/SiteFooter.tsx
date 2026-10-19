import { Link } from '@tanstack/react-router';

export const LEGAL_CONTACT_EMAIL = 'beabulnow@gmail.com';
export const LEGAL_UPDATED = 'September 4, 2026';

/**
 * Global site footer with the legal and policy links every page should carry.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <p className="inline-note">
            Ledgerly is a self custodial wallet. You hold your own keys and you are responsible for
            your recovery phrase.
          </p>
        </div>

        <nav className="site-footer-links" aria-label="Legal">
          <Link to="/terms">Terms of Service</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/risk">Risk Disclosure</Link>
          <Link to="/wallets">XRPL wallets</Link>
          <Link to="/security">Security</Link>
          <Link to="/security-center">Security center</Link>
          <Link to="/contact" search={{}}>
            Contact
          </Link>
        </nav>
      </div>
      <p className="site-footer-legal">
        &copy; {new Date().getFullYear()} Ledgerly. Ledgerly is software, not a bank, exchange,
        broker or money transmitter, and it never takes custody of your funds.
      </p>
    </footer>
  );
}
