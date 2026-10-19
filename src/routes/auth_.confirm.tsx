import { useEffect, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { SiteHeader } from '@/ledgerly/ui/components/SiteHeader';
import { SiteFooter } from '@/ledgerly/ui/components/SiteFooter';
import { verifyEmailToken } from '@/lib/confirm-email.functions';
import { isEmailConfirmed } from '@/lib/email-confirmed';
import {
  EMAIL_VERIFIED_BODY,
  EMAIL_VERIFIED_TITLE,
  confirmationFailureCopy,
  confirmEmailFromLink,
  requestSignupConfirmation,
  sessionToConfirmResult,
  type ConfirmEmailFailure,
  type ConfirmEmailResult,
} from '@/lib/confirm-email';
import '@ledgerly/ui/styles.css';

type ConfirmSearch = {
  token_hash?: string;
  type?: string;
  code?: string;
};

export const Route = createFileRoute('/auth_/confirm')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ConfirmSearch => ({
    ...(typeof search.token_hash === 'string' ? { token_hash: search.token_hash } : {}),
    ...(typeof search.type === 'string' ? { type: search.type } : {}),
    ...(typeof search.code === 'string' ? { code: search.code } : {}),
  }),
  head: () => ({
    meta: [
      { title: 'Confirm your email — Ledgerly' },
      { name: 'robots', content: 'noindex, nofollow' },
      {
        name: 'description',
        content: 'Confirm the email address on your Ledgerly profile.',
      },
    ],
  }),
  component: ConfirmEmailPage,
});

const attempts = new Map<string, Promise<ConfirmEmailResult>>();

function attemptKey(search: ConfirmSearch): string | null {
  if (search.token_hash) return `token:${search.type ?? 'email'}:${search.token_hash}`;
  if (search.code) return `code:${search.code}`;
  return null;
}

async function exchangeConfirmationCode(code: string): Promise<ConfirmEmailResult> {
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  const fromExchange = sessionToConfirmResult(exchanged.data.session, exchanged.error);
  if (fromExchange.ok) return fromExchange;
  // detectSessionInUrl may have exchanged this same code already.
  const existing = await supabase.auth.getSession();
  const fromExisting = sessionToConfirmResult(existing.data.session, null);
  if (fromExisting.ok) return fromExisting;
  return fromExchange;
}

function confirmLink(search: ConfirmSearch): Promise<ConfirmEmailResult> {
  const key = attemptKey(search) ?? 'missing';
  const existing = attempts.get(key);
  if (existing) return existing;
  const pending = confirmEmailFromLink(
    {
      verifyToken: (input) => verifyEmailToken({ data: input }),
      exchangeCode: exchangeConfirmationCode,
    },
    { tokenHash: search.token_hash, type: search.type, code: search.code },
  );
  attempts.set(key, pending);
  return pending;
}

function ConfirmEmailPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [result, setResult] = useState<ConfirmEmailResult | null>(null);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    if (!attemptKey(search)) {
      setResult((current) => current ?? { ok: false, reason: 'invalid' });
      return () => {
        active = false;
      };
    }
    void confirmLink(search)
      .then(async (confirmed) => {
        if (!active) return;
        if (confirmed.ok) {
          const current = await supabase.auth.getSession();
          const currentUser = current.data.session?.user;
          const sameSession = current.data.session?.access_token === confirmed.accessToken;
          const sameAccount =
            isEmailConfirmed(currentUser) &&
            Boolean(confirmed.email) &&
            currentUser?.email === confirmed.email;
          if (!sameSession && !sameAccount) {
            const { error } = await supabase.auth.setSession({
              access_token: confirmed.accessToken,
              refresh_token: confirmed.refreshToken,
            });
            if (!active) return;
            if (error) {
              setResult({ ok: false, reason: 'invalid' });
              return;
            }
          }
          if (confirmed.email) setEmail(confirmed.email);
          window.history.replaceState(null, '', '/auth/confirm');
        }
        setResult(confirmed);
      })
      .catch(() => {
        if (active) setResult({ ok: false, reason: 'invalid' });
      });
    return () => {
      active = false;
    };
  }, [search]);

  async function resend(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    setResendError(null);
    try {
      const sent = await requestSignupConfirmation(
        (args) => supabase.auth.resend(args),
        email,
        window.location.origin,
      );
      if (!sent.ok) setResendError(sent.message);
      else
        setNotice(
          `A new confirmation link is on its way to ${email.trim()}. It expires in one hour.`,
        );
    } catch (caught) {
      setResendError(caught instanceof Error ? caught.message : 'Could not resend the email.');
    } finally {
      setPending(false);
    }
  }

  const failure: ConfirmEmailFailure | null = result && !result.ok ? result.reason : null;
  const failureCopy = failure ? confirmationFailureCopy(failure) : null;
  const destination = result?.ok && result.provider === 'joey' ? '/balances' : '/wallet';

  return (
    <div className="shell">
      <SiteHeader />
      <main className="auth-page">
        <div className="stack auth-panel">
          <div className="card card--plain">
            {!result ? (
              <>
                <h1 className="card-title">Confirming your email…</h1>
                <p className="card-note" role="status">
                  Checking this confirmation link.
                </p>
              </>
            ) : result.ok ? (
              <>
                <span className="card-eyebrow">Profile email</span>
                <h1 className="card-title">{EMAIL_VERIFIED_TITLE}</h1>
                <p className="card-note" role="status" style={{ marginTop: 6 }}>
                  {EMAIL_VERIFIED_BODY}
                </p>
                {result.email ? (
                  <p className="inline-note" style={{ marginTop: 10 }}>
                    Verified address: <strong>{result.email}</strong>
                  </p>
                ) : null}
                <button
                  type="button"
                  className="button button--accent button--block"
                  style={{ marginTop: 16 }}
                  onClick={() => void navigate({ to: destination })}
                >
                  Continue
                </button>
              </>
            ) : (
              <>
                <h1 className="card-title">{failureCopy?.title}</h1>
                <p className="card-note" role="alert" style={{ marginTop: 6 }}>
                  {failureCopy?.body}
                </p>
                <form onSubmit={resend} className="stack" style={{ marginTop: 16 }}>
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
                  {resendError ? (
                    <div className="callout callout--danger" role="alert">
                      {resendError}
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
                    disabled={pending}
                  >
                    {pending ? 'Sending…' : 'Resend confirmation email'}
                  </button>
                </form>
                <p className="inline-note" style={{ textAlign: 'center' }}>
                  <Link to="/auth">Back to sign in</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
