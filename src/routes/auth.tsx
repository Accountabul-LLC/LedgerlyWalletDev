import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { startGoogleSignIn } from '@/integrations/supabase/oauth';
import { SiteHeader } from '@/ledgerly/ui/components/SiteHeader';
import { SiteFooter } from '@/ledgerly/ui/components/SiteFooter';

import { assessPassword, MIN_PASSWORD_LENGTH } from '@ledgerly/core';
import { createJoeyChallenge, verifyJoeySignIn } from '@/lib/joey-auth.functions';
import { emailConfirmRedirect, requestSignupConfirmation } from '@/lib/confirm-email';
import { isEmailConfirmed } from '@/lib/email-confirmed';
import { readAuthEntry } from '@/lib/auth-entry';
import { joeyProvider } from '@/ledgerly/ui/external/joey';
import { GoogleMark, JoeyMark } from '@/ledgerly/ui/components/icons';

import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/auth')({
  ssr: false,
  beforeLoad: async () => {
    const authUser = await readAuthEntry(supabase.auth);
    if (isEmailConfirmed(authUser)) {
      throw redirect({
        to: authUser?.user_metadata.auth_provider === 'joey' ? '/balances' : '/wallet',
        replace: true,
      });
    }
    return { authUser };
  },
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, follow' },
      { title: 'Sign in to Ledgerly' },
      {
        name: 'description',
        content:
          'Sign in or create a Ledgerly profile to open your non-custodial XRP Ledger wallet. Your keys stay encrypted on your device.',
      },
      { property: 'og:title', content: 'Sign in to Ledgerly' },
      {
        property: 'og:description',
        content: 'Create a Ledgerly profile to open your wallet. Keys never leave your device.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { authUser } = Route.useRouteContext();
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset' | 'checkEmail'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const authReady = true;

  useEffect(() => {
    let active = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const enter = (user: {
      email?: string | null;
      email_confirmed_at?: string | null;
      user_metadata?: { auth_provider?: unknown };
    }) => {
      if (!active) return;
      if (!isEmailConfirmed(user)) {
        if (user.email) setEmail(user.email);
        setPassword('');
        setMode('checkEmail');
        return;
      }
      void navigate({
        to: user.user_metadata?.auth_provider === 'joey' ? '/balances' : '/wallet',
        replace: true,
      });
    };
    if (authUser) enter(authUser);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const current = ++generation;
      clearTimeout(timer);
      if (event === 'INITIAL_SESSION' || !session) return;
      // Supabase holds its auth lock during callbacks. Route guards must run later.
      timer = setTimeout(() => {
        void readAuthEntry(supabase.auth)
          .then((user) => {
            if (active && current === generation && user) enter(user);
          })
          .catch(() => {
            if (active && current === generation)
              setError('Could not check sign-in. Please try again.');
          });
      }, 0);
    });
    return () => {
      active = false;
      generation += 1;
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, [navigate, authUser]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw new Error(resetError.message);
        setNotice(
          `If a profile exists for ${email.trim()}, a reset link is on its way. Open it on this device and you can choose a new password. The link expires in one hour.`,
        );
        return;
      }
      if (mode === 'signUp') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: emailConfirmRedirect(window.location.origin),
            data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
          },
        });
        if (signUpError) throw new Error(signUpError.message);
        if (!data.session || !isEmailConfirmed(data.user)) {
          setPassword('');
          setMode('checkEmail');
        }
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        if (/email not confirmed/i.test(signInError.message)) {
          setPassword('');
          setMode('checkEmail');
          return;
        }
        throw new Error(signInError.message);
      }
      setPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  async function resendConfirmation() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const sent = await requestSignupConfirmation(
        (args) => supabase.auth.resend(args),
        email,
        window.location.origin,
      );
      if (!sent.ok) setError(sent.message);
      else
        setNotice(
          `A new confirmation link is on its way to ${email.trim()}. It expires in one hour.`,
        );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not resend the email.');
    } finally {
      setPending(false);
    }
  }

  async function google() {
    setError(null);
    setPending(true);
    try {
      await startGoogleSignIn(window.location.origin);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google sign in failed.');
    } finally {
      setPending(false);
    }
  }

  async function joey() {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      if (!joeyProvider.isAvailable()) {
        throw new Error(
          'Joey is not installed in this browser. Install it, then come back to continue with that wallet.',
        );
      }
      const challenge = await createJoeyChallenge();
      const proof = await joeyProvider.signIn({
        statement: challenge.statement,
        nonce: challenge.nonce,
      });
      const verified = await verifyJoeySignIn({ data: proof });
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: verified.tokenHash,
        type: 'email',
      });
      if (otpError) throw new Error(otpError.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Joey sign in failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="shell">
      <SiteHeader />
      <main className="auth-page">
        <div className="stack auth-panel">
          <div className="card card--plain">
            <h1 className="card-title">
              {mode === 'checkEmail'
                ? 'Check your email'
                : mode === 'signIn'
                  ? 'Sign in to your wallet'
                  : mode === 'signUp'
                    ? 'Create your Ledgerly profile'
                    : 'Reset your profile password'}
            </h1>
            <p className="card-note" style={{ marginTop: 6 }}>
              {mode === 'checkEmail'
                ? `We sent a confirmation link to ${email.trim() || 'your email'}. Open it to verify this address. Ledgerly will not sign you in until the email is verified.`
                : mode === 'reset'
                  ? 'Enter the email on your profile and we will send you a link to choose a new password. This is the password for your Ledgerly profile, not the unlock password for your wallet on this device.'
                  : 'Your profile keeps your wallet names and saved payees with you. It never holds your recovery phrase, your keys or your unlock password. Those stay encrypted on this device.'}
            </p>

            {mode === 'checkEmail' ? (
              <div className="stack">
                {error ? (
                  <div className="callout callout--danger" role="alert">
                    {error}
                  </div>
                ) : null}
                {notice ? (
                  <div className="callout callout--info" role="status">
                    {notice}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="button button--accent button--block"
                  disabled={!authReady || pending || email.trim().length === 0}
                  onClick={() => void resendConfirmation()}
                >
                  {pending ? 'Sending…' : 'Resend confirmation email'}
                </button>
                <p className="inline-note" style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setMode('signIn');
                      setError(null);
                      setNotice(null);
                    }}
                  >
                    Back to sign in
                  </button>
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="stack">
                {mode === 'signUp' ? (
                  <label className="field">
                    <span className="field-label">Display name</span>
                    <input
                      type="text"
                      autoComplete="name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                ) : null}
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                {mode === 'reset' ? null : (
                  <label className="field">
                    <span className="field-label">Password</span>
                    <input
                      type="password"
                      required
                      autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    {mode === 'signUp' ? <PasswordMeter password={password} /> : null}
                  </label>
                )}

                {error ? (
                  <div className="callout callout--danger" role="alert">
                    {error}
                  </div>
                ) : null}
                {notice ? (
                  <div className="callout callout--info" role="status">
                    {notice}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="button button--accent button--block"
                  disabled={
                    !authReady ||
                    pending ||
                    (mode === 'signUp' && !assessPassword(password).acceptable)
                  }
                >
                  {pending
                    ? 'Working…'
                    : mode === 'signIn'
                      ? 'Sign in'
                      : mode === 'signUp'
                        ? 'Create profile'
                        : 'Send reset link'}
                </button>
              </form>
            )}

            {mode === 'reset' || mode === 'checkEmail' ? null : (
              <>
                <div className="auth-divider">or</div>

                <button
                  type="button"
                  className="button button--secondary button--block"
                  onClick={() => void google()}
                  disabled={!authReady || pending}
                >
                  <GoogleMark /> Continue with Google
                </button>

                <button
                  type="button"
                  className="button button--secondary button--block"
                  onClick={() => void joey()}
                  disabled={!authReady || pending}
                >
                  <JoeyMark /> Continue with Joey
                </button>
                <p className="inline-note" style={{ textAlign: 'center' }}>
                  Joey keeps the keys. Ledgerly only checks the signature, then opens your profile.
                  Need the extension?{' '}
                  <a href={joeyProvider.installUrl} target="_blank" rel="noreferrer">
                    Get Joey
                  </a>
                </p>
              </>
            )}

            {mode === 'checkEmail' ? null : (
              <p className="inline-note" style={{ textAlign: 'center' }}>
                {mode === 'signIn' ? (
                  <>
                    New here?{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setMode('signUp');
                        setError(null);
                        setNotice(null);
                      }}
                    >
                      Create a profile
                    </button>
                    {' · '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setMode('reset');
                        setPassword('');
                        setError(null);
                        setNotice(null);
                      }}
                    >
                      Forgot password
                    </button>
                  </>
                ) : (
                  <>
                    {mode === 'signUp' ? 'Already have a profile?' : 'Remembered it?'}{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setMode('signIn');
                        setError(null);
                        setNotice(null);
                      }}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            )}
          </div>

          <p className="inline-note" style={{ textAlign: 'center' }}>
            A profile is how you get into Ledgerly. It is still a self custody wallet: your recovery
            phrase and keys stay on your device and never reach our servers.
          </p>

          <p className="inline-note" style={{ textAlign: 'center' }}>
            One browser holds one wallet set. If you created a wallet on another device, sign in
            here and restore it with your recovery phrase.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

const STRENGTH_LABEL = ['Too weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const;

function PasswordMeter({ password }: { password: string }) {
  const assessment = useMemo(() => assessPassword(password), [password]);
  if (password.length === 0) {
    return (
      <p className="field-hint" style={{ marginTop: 6 }}>
        Use at least {MIN_PASSWORD_LENGTH} characters.
      </p>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div className="meter">
        {[1, 2, 3, 4].map((step) => (
          <i key={step} data-on={assessment.score >= step} data-score={assessment.score} />
        ))}
      </div>
      <p className="field-hint" style={{ marginTop: 6 }}>
        {STRENGTH_LABEL[assessment.score]}
        {assessment.warnings.length > 0 ? ` · ${assessment.warnings[0]}` : ''}
      </p>
    </div>
  );
}
