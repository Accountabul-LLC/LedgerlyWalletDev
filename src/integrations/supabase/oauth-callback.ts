import { isEmailConfirmed } from '@/lib/email-confirmed';

export type GoogleCallbackResult =
  | { status: 'signed-in'; destination: '/wallet' | '/balances' }
  | { status: 'cancelled' }
  | { status: 'failed' }
  | { status: 'browser' }
  | { status: 'unconfirmed' };

type CallbackUser = {
  email_confirmed_at?: string | null;
  user_metadata?: { auth_provider?: unknown } | null;
};

type CallbackSession = { user: CallbackUser } | null;

type CallbackError = { message?: string; code?: string } | null;

export type GoogleCallbackAuth = {
  getSession: () => Promise<{ data: { session: CallbackSession }; error: CallbackError }>;
  exchangeCodeForSession: (
    code: string,
  ) => Promise<{ data: { session: CallbackSession }; error: CallbackError }>;
};

const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,2048}$/;

export function readOAuthCallback(
  search: string,
  hash = '',
): { code: string | null; error: string | null; errorCode: string | null; malformedCode: boolean } {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const rawCode = query.get('code') ?? fragment.get('code');
  const rawError = query.get('error') ?? fragment.get('error');
  const rawErrorCode = query.get('error_code') ?? fragment.get('error_code');
  const code = rawCode && CODE_PATTERN.test(rawCode) ? rawCode : null;
  return {
    code,
    malformedCode: Boolean(rawCode) && code === null,
    error: bounded(rawError),
    errorCode: bounded(rawErrorCode),
  };
}

function bounded(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 128 ? value : 'invalid_request';
}

function verifierMissing(error: CallbackError): boolean {
  if (!error) return false;
  return (
    error.code === 'pkce_code_verifier_not_found' || /code verifier/i.test(error.message ?? '')
  );
}

function destinationFor(user: CallbackUser): '/wallet' | '/balances' {
  return user.user_metadata?.auth_provider === 'joey' ? '/balances' : '/wallet';
}

function finish(session: CallbackSession): GoogleCallbackResult {
  if (!session || !isEmailConfirmed(session.user)) return { status: 'unconfirmed' };
  return { status: 'signed-in', destination: destinationFor(session.user) };
}

/**
 * Complete the browser return from Supabase Auth.
 * A code is exchanged once here. An error, or a code that does not exchange,
 * never reuses an older session. The caller strips the query afterwards.
 */
export async function completeGoogleCallback(
  auth: GoogleCallbackAuth,
  search: string,
  hash = '',
): Promise<GoogleCallbackResult> {
  const params = readOAuthCallback(search, hash);
  if (params.error || params.errorCode) {
    const denied = params.error === 'access_denied' || params.errorCode === 'access_denied';
    return { status: denied ? 'cancelled' : 'failed' };
  }
  if (params.malformedCode) return { status: 'failed' };
  if (params.code) {
    const exchanged = await auth.exchangeCodeForSession(params.code);
    if (verifierMissing(exchanged.error)) return { status: 'browser' };
    if (exchanged.error || !exchanged.data.session) return { status: 'failed' };
    return finish(exchanged.data.session);
  }
  const existing = await auth.getSession();
  if (existing.error || !existing.data.session) return { status: 'failed' };
  return finish(existing.data.session);
}
