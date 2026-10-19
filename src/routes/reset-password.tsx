import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@ledgerly/core';
import { SiteHeader } from '@/ledgerly/ui/components/SiteHeader';
import { SiteFooter } from '@/ledgerly/ui/components/SiteFooter';
import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/reset-password')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, follow' },
      { title: 'Reset your Ledgerly password' },
      {
        name: 'description',
        content:
          'Choose a new password for the optional Ledgerly account that syncs your wallet names and saved payees.',
      },
      { property: 'og:title', content: 'Reset your Ledgerly password' },
      {
        property: 'og:description',
        content: 'Set a new password for your Ledgerly sync account.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    const apply = (session: { user?: { email?: string | null } } | null) => {
      if (!active) return;
      setReady(Boolean(session));
      setAccountEmail(session?.user?.email ?? null);
    };
    const rawCode = new URLSearchParams(window.location.search).get('code');
    const code = rawCode && /^[A-Za-z0-9._~-]{8,2048}$/.test(rawCode) ? rawCode : null;
    if (rawCode) {
      const finish = code
        ? supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
            window.history.replaceState(window.history.state, '', '/reset-password');
            apply(error ? null : data.session);
          })
        : Promise.resolve().then(() => {
            if (!active) return;
            window.history.replaceState(window.history.state, '', '/reset-password');
            setReady(false);
          });
      void finish.catch(() => {
        if (active) setReady(false);
      });
      return () => {
        active = false;
      };
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    void supabase.auth.getSession().then(({ data: current }) => apply(current.session));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const assessment = useMemo(() => assessPassword(password), [password]);
  const tooWeak = password.length > 0 && !assessment.acceptable;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSave = ready === true && assessment.acceptable && confirm === password && !pending;

  return (
    <div className="shell">
      <SiteHeader />
      <main className="auth-page">
        <div className="stack auth-panel">
          <div className="card card--plain">
            <span className="card-eyebrow">Profile account</span>
            <h1 className="card-title">Choose a new password</h1>
            <p className="card-note" style={{ marginTop: 6 }}>
              This sets a new sign in password for your Ledgerly profile, the optional account that
              keeps your wallet names and saved payees with you. It is not your wallet unlock
              password, and changing it cannot move funds or touch your recovery phrase.
            </p>

            {accountEmail ? (
              <p className="inline-note" style={{ marginTop: 10 }}>
                Signed in from your reset link as <strong>{accountEmail}</strong>
              </p>
            ) : null}

            {done ? (
              <div className="stack" style={{ marginTop: 16 }}>
                <div className="callout callout--info" role="status">
                  Your password is updated. You can use it next time you sign in.
                </div>
                <button
                  type="button"
                  className="button button--accent button--block"
                  onClick={() => void navigate({ to: '/wallet' })}
                >
                  Go to your wallet
                </button>
              </div>
            ) : ready === false ? (
              <div className="stack" style={{ marginTop: 16 }}>
                <div className="callout callout--danger" role="alert">
                  This page only works when you open it from the password reset email. The link may
                  have expired or already been used.
                </div>
                <Link to="/auth" className="button button--accent button--block">
                  Back to sign in
                </Link>
                <p className="inline-note">
                  On the sign in page, enter your email and choose "Forgot password" to get a fresh
                  link.
                </p>
              </div>
            ) : (
              <form
                className="stack"
                style={{ marginTop: 16 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canSave) return;
                  setPending(true);
                  setError(null);
                  void supabase.auth
                    .updateUser({ password })
                    .then(({ error: updateError }) => {
                      if (updateError) setError(updateError.message);
                      else setDone(true);
                    })
                    .finally(() => setPending(false));
                }}
              >
                <label className="field">
                  <span className="field-label">New password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <span className="field-hint">
                    Use at least {MIN_PASSWORD_LENGTH} characters, the same strength as creating a
                    profile.
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">Confirm new password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </label>

                {tooWeak ? (
                  <p className="inline-note">
                    {assessment.warnings[0] ?? 'Choose a stronger password.'}
                  </p>
                ) : null}
                {mismatch ? <p className="inline-note">The two passwords do not match.</p> : null}
                {error ? (
                  <div className="callout callout--danger" role="alert">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="button button--accent button--block"
                  disabled={!canSave}
                >
                  {pending ? 'Saving…' : 'Save password'}
                </button>
              </form>
            )}
          </div>

          <p className="inline-note" style={{ textAlign: 'center' }}>
            Your wallet unlock password is separate and never leaves this device.{' '}
            <Link to="/wallet">Open your wallet</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
