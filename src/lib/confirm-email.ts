import { isEmailConfirmed } from '@/lib/email-confirmed';

/** Where signup, resend, and the branded template send the person to finish. */
export const EMAIL_CONFIRM_PATH = '/auth/confirm';

export function emailConfirmRedirect(origin: string): string {
  return `${origin.replace(/\/$/, '')}${EMAIL_CONFIRM_PATH}`;
}

/** Mail templates can drop two trailing slashes. Keep this oracle in step with that. */
function withoutConfiguredSlash(value: string): string {
  let site = value;
  for (let pass = 0; pass < 2 && site.endsWith('/'); pass += 1) site = site.slice(0, -1);
  return site;
}

/**
 * Link inside the confirmation email. Supabase fills RedirectTo with SiteURL when
 * signup omits emailRedirectTo, which is what both native clients do. That default
 * is not the confirmation page. A Site URL with a trailing slash still targets
 * /auth/confirm. An explicit preview, www, or local confirmation URL is preserved,
 * including a query string already on that URL.
 */
export function confirmationEmailHref(input: {
  siteUrl: string;
  redirectTo?: string | null;
  tokenHash: string;
}): string {
  const redirect = input.redirectTo ?? '';
  const site = withoutConfiguredSlash(input.siteUrl);
  const redirectBare = withoutConfiguredSlash(redirect);
  const explicit =
    redirect !== '' &&
    redirect !== input.siteUrl &&
    redirectBare !== site &&
    redirect !== `${site}/` &&
    `${redirect}/` !== input.siteUrl &&
    `${redirect}/` !== site;
  const target = explicit ? redirect : `${site}/auth/confirm`;
  return `${target}${target.includes('?') ? '&' : '?'}token_hash=${input.tokenHash}&type=email`;
}

export const CONFIRM_EMAIL_TYPES = ['signup', 'email'] as const;
export type ConfirmEmailType = (typeof CONFIRM_EMAIL_TYPES)[number];

export type ConfirmEmailFailure = 'expired' | 'invalid' | 'already_used';

export type ConfirmEmailResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      email: string | null;
      provider: string | null;
    }
  | { ok: false; reason: ConfirmEmailFailure };

const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{8,2048}$/;

export function parseConfirmType(value: unknown): ConfirmEmailType | null {
  return value === 'signup' || value === 'email' ? value : null;
}

/**
 * Supabase uses one error for several dead links. "already" is checked first
 * so a used link is not described as merely expired.
 */
export function classifyConfirmError(error: {
  message?: string;
  code?: string | null;
}): ConfirmEmailFailure {
  const message = `${error.message ?? ''}`.toLowerCase();
  const code = `${error.code ?? ''}`.toLowerCase();
  if (message.includes('already') || code.includes('already')) return 'already_used';
  if (code === 'otp_expired' || message.includes('expired')) return 'expired';
  return 'invalid';
}

type ConfirmSession = {
  access_token?: string;
  refresh_token?: string;
  user?: {
    email?: string | null;
    email_confirmed_at?: string | null;
    user_metadata?: Record<string, unknown> | null;
  } | null;
};

export function sessionToConfirmResult(
  session: ConfirmSession | null | undefined,
  error: { message?: string; code?: string | null } | null | undefined,
): ConfirmEmailResult {
  if (error || !session?.access_token || !session.refresh_token || !session.user) {
    return { ok: false, reason: classifyConfirmError(error ?? { message: 'invalid' }) };
  }
  if (!isEmailConfirmed(session.user)) return { ok: false, reason: 'invalid' };
  const provider = session.user.user_metadata?.['auth_provider'];
  return {
    ok: true,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    email: session.user.email ?? null,
    provider: typeof provider === 'string' ? provider : null,
  };
}

type VerifyAuth = {
  verifyOtp: (args: { token_hash: string; type: ConfirmEmailType }) => Promise<{
    data: { session: ConfirmSession | null };
    error: { message: string; code?: string } | null;
  }>;
};

/**
 * Verifies a signup confirmation token_hash. The hash is the secret, so this
 * does not need the PKCE code verifier from the browser that started signup.
 */
export async function confirmEmailWithAuth(
  auth: VerifyAuth,
  input: { tokenHash: string; type: string },
): Promise<ConfirmEmailResult> {
  const type = parseConfirmType(input.type.trim());
  const tokenHash = input.tokenHash.trim();
  if (!type || !TOKEN_PATTERN.test(tokenHash)) return { ok: false, reason: 'invalid' };
  const { data, error } = await auth.verifyOtp({ token_hash: tokenHash, type });
  return sessionToConfirmResult(data.session, error);
}

export async function confirmEmailFromLink(
  deps: {
    verifyToken: (input: { tokenHash: string; type: string }) => Promise<ConfirmEmailResult>;
    exchangeCode: (code: string) => Promise<ConfirmEmailResult>;
  },
  link: { tokenHash?: string | null; type?: string | null; code?: string | null },
): Promise<ConfirmEmailResult> {
  const tokenHash = link.tokenHash?.trim() ?? '';
  if (tokenHash) {
    return deps.verifyToken({ tokenHash, type: link.type?.trim() || 'email' });
  }
  const code = link.code?.trim() ?? '';
  if (code) return deps.exchangeCode(code);
  return { ok: false, reason: 'invalid' };
}

export const EMAIL_VERIFIED_TITLE = 'Email verified';
export const EMAIL_VERIFIED_BODY =
  'Your email address is confirmed. Continue into Ledgerly to open your wallet.';

export function confirmationFailureCopy(reason: ConfirmEmailFailure): {
  title: string;
  body: string;
} {
  switch (reason) {
    case 'expired':
      return {
        title: 'This link has expired',
        body: 'Confirmation links last one hour. Request a new one and open it to verify your email.',
      };
    case 'already_used':
      return {
        title: 'This link was already used',
        body: 'Each confirmation link works once. If your email is already verified, sign in. If it is not, request a new link.',
      };
    case 'invalid':
      return {
        title: 'This link is invalid',
        body: 'The confirmation link is incomplete or no longer valid. Request a new one. The new link works in any browser.',
      };
  }
}

export async function requestSignupConfirmation(
  resend: (args: {
    type: 'signup';
    email: string;
    options: { emailRedirectTo: string };
  }) => Promise<{ error: { message: string } | null }>,
  email: string,
  origin: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: 'Enter the email address you used to sign up.' };
  }
  const { error } = await resend({
    type: 'signup',
    email: trimmed,
    options: { emailRedirectTo: emailConfirmRedirect(origin) },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
