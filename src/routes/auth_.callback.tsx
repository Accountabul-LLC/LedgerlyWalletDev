import { useEffect, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import {
  completeGoogleCallback,
  type GoogleCallbackResult,
} from '@/integrations/supabase/oauth-callback';
import { SiteHeader } from '@/ledgerly/ui/components/SiteHeader';
import { SiteFooter } from '@/ledgerly/ui/components/SiteFooter';
import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/auth_/callback')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Completing sign-in — Ledgerly' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AuthCallback,
});

const COPY: Record<
  Exclude<GoogleCallbackResult['status'], 'signed-in'>,
  { title: string; body: string }
> = {
  cancelled: {
    title: 'Google sign-in was cancelled',
    body: 'Nothing was changed. You can try again from the sign-in page.',
  },
  browser: {
    title: 'Sign-in did not finish in this browser',
    body: 'Go back and choose Google again from this same browser. Opening the link in another app drops the sign-in attempt.',
  },
  failed: {
    title: 'Sign-in could not be completed',
    body: 'The link may have expired, or Google could not finish sign-in. Please try again from this browser.',
  },
  unconfirmed: {
    title: 'This Google account has no confirmed email',
    body: 'Ledgerly needs a confirmed email on the profile. Try a Google account with an email address, or create a profile with email and a password.',
  },
};

const attempts = new Map<string, Promise<GoogleCallbackResult>>();

function completeOnce(search: string, hash: string): Promise<GoogleCallbackResult> {
  const key = `${search}${hash}`;
  const existing = attempts.get(key);
  if (existing) return existing;
  const pending = completeGoogleCallback(supabase.auth, search, hash);
  attempts.set(key, pending);
  return pending;
}

function AuthCallback() {
  const navigate = useNavigate();
  const [result, setResult] = useState<GoogleCallbackResult | null>(null);
  useEffect(() => {
    let active = true;
    const search = window.location.search;
    const hash = window.location.hash;
    void completeOnce(search, hash)
      .then((next) => {
        if (!active) return;
        window.history.replaceState(window.history.state, '', '/auth/callback');
        if (next.status === 'signed-in') {
          void navigate({ to: next.destination, replace: true });
          return;
        }
        setResult(next);
      })
      .catch(() => {
        if (!active) return;
        window.history.replaceState(window.history.state, '', '/auth/callback');
        setResult({ status: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [navigate]);
  const problem = result && result.status !== 'signed-in' ? COPY[result.status] : null;
  return (
    <div className="shell">
      <SiteHeader />
      <main className="auth-page">
        <div className="stack auth-panel">
          <div className="card card--plain">
            <h1 className="card-title">{problem ? problem.title : 'Completing sign-in…'}</h1>
            <p className="card-note" role={problem ? 'alert' : 'status'}>
              {problem ? problem.body : 'Confirming your Ledgerly profile.'}
            </p>
            {problem ? (
              <Link to="/auth" replace className="button button--accent">
                Back to sign in
              </Link>
            ) : null}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
