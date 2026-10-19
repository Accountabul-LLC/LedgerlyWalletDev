import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { isVerifiedSession } from '@/lib/email-confirmed';
import { signOutEverywhere } from '../session';

/**
 * Global site header for every page outside the wallet shell. The wallet has
 * its own TopBar with network and account controls, so it does not use this.
 */
export function SiteHeader() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(isVerifiedSession(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(isVerifiedSession(session)),
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true">
          L
        </span>
        Ledgerly
      </Link>
      <nav className="topbar-actions" aria-label="Primary">
        <Link to="/wallet" className="pill pill--button">
          {signedIn ? 'My wallet' : 'Open wallet'}
        </Link>
        {signedIn ? (
          <Link to="/balances" className="pill pill--button">
            Watch only
          </Link>
        ) : null}
        {signedIn ? (
          <button
            type="button"
            className="pill pill--button"
            title={error ?? 'Sign out of your Ledgerly profile'}
            disabled={leaving}
            onClick={() => {
              if (leaving) return;
              setLeaving(true);
              setError(null);
              // Awaited end to end, and the session is confirmed gone before
              // the page moves, so sign out can never land on a blank screen.
              void signOutEverywhere()
                .then(() => {
                  window.location.replace('/auth');
                })
                .catch((caught: unknown) => {
                  setLeaving(false);
                  setError(caught instanceof Error ? caught.message : 'Could not sign out.');
                });
            }}
          >
            {leaving ? 'Signing out…' : error ? 'Try again' : 'Sign out'}
          </button>
        ) : (
          <Link to="/auth" className="pill pill--button">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
