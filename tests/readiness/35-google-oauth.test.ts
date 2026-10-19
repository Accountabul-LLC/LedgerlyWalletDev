import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { googleRedirectTo } from '@/integrations/supabase/oauth';
import {
  completeGoogleCallback,
  readOAuthCallback,
  type GoogleCallbackAuth,
} from '@/integrations/supabase/oauth-callback';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const confirmed = {
  user: {
    email_confirmed_at: '2026-10-14T00:00:00.000Z',
    user_metadata: {},
  },
};

function auth(overrides: Partial<GoogleCallbackAuth> = {}): GoogleCallbackAuth {
  return {
    getSession: vi.fn(async () => ({ data: { session: confirmed }, error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ data: { session: confirmed }, error: null })),
    ...overrides,
  };
}

describe('Google OAuth return', () => {
  it('sends the browser back to this site and leaves Google’s redirect on Supabase', () => {
    expect(googleRedirectTo('https://ledgerlywallet.com')).toBe(
      'https://ledgerlywallet.com/auth/callback',
    );
    expect(googleRedirectTo('https://www.ledgerlywallet.com')).toBe(
      'https://www.ledgerlywallet.com/auth/callback',
    );
    expect(googleRedirectTo('http://localhost:3000')).toBe('http://localhost:3000/auth/callback');
    expect(() => googleRedirectTo('http://evil.example')).toThrow(/Could not start Google sign-in/);
    expect(() => googleRedirectTo('https://ledgerlywallet.com/auth/callback')).toThrow(
      /Could not start Google sign-in/,
    );
    expect(() => googleRedirectTo('javascript:alert(1)')).toThrow(/Could not start Google sign-in/);
  });

  it('reads a cancellation without treating it as a code', () => {
    expect(
      readOAuthCallback('?error=access_denied&error_code=access_denied&error_description=no'),
    ).toMatchObject({ code: null, error: 'access_denied', errorCode: 'access_denied' });
  });

  it('stops a cancelled or denied return before any session is reused', async () => {
    const client = auth();
    const cancelled = await completeGoogleCallback(
      client,
      '?error=access_denied&error_description=The+user+cancelled',
    );
    const denied = await completeGoogleCallback(client, '?error_code=access_denied');
    expect(cancelled).toEqual({ status: 'cancelled' });
    expect(denied).toEqual({ status: 'cancelled' });
    expect(client.getSession).not.toHaveBeenCalled();
    expect(client.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('shows a failure for provider errors and does not call Google again', async () => {
    const client = auth();
    const result = await completeGoogleCallback(
      client,
      '?error=server_error&error_code=unexpected_failure',
    );
    expect(result).toEqual({ status: 'failed' });
    expect(client.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('destination');
  });

  it('exchanges the PKCE code and ignores any session already stored', async () => {
    const client = auth({
      getSession: vi.fn(async () => ({
        data: {
          session: {
            user: {
              email_confirmed_at: '2026-10-14T00:00:00.000Z',
              user_metadata: { auth_provider: 'older' },
            },
          },
        },
        error: null,
      })),
    });
    const result = await completeGoogleCallback(client, '?code=pkce-code-1');
    expect(client.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(client.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code-1');
    expect(client.getSession).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'signed-in', destination: '/wallet' });
  });

  it('does not accept an older session when the new code cannot be exchanged', async () => {
    const client = auth({
      exchangeCodeForSession: vi.fn(async () => ({
        data: { session: null },
        error: { message: 'invalid grant', code: 'invalid_grant' },
      })),
    });
    const result = await completeGoogleCallback(client, '?code=pkce-code-1');
    expect(result).toEqual({ status: 'failed' });
    expect(client.getSession).not.toHaveBeenCalled();
  });

  it('explains a missing PKCE verifier without exposing the provider error', async () => {
    const client = auth({
      exchangeCodeForSession: vi.fn(async () => ({
        data: { session: null },
        error: {
          message: 'PKCE code verifier not found in storage.',
          code: 'pkce_code_verifier_not_found',
        },
      })),
    });
    const result = await completeGoogleCallback(client, '?code=pkce-code-1');
    expect(result).toEqual({ status: 'browser' });
    expect(JSON.stringify(result)).not.toMatch(/verifier|storage|pkce/i);
  });

  it('keeps an unconfirmed account off the wallet', async () => {
    const client = auth({
      exchangeCodeForSession: vi.fn(async () => ({
        data: { session: { user: { email_confirmed_at: null, user_metadata: {} } } },
        error: null,
      })),
    });
    const result = await completeGoogleCallback(client, '?code=pkce-code-1');
    expect(result).toEqual({ status: 'unconfirmed' });
  });

  it('sends a Joey session to balances and a direct visit with a session into the app', async () => {
    const joey = auth({
      exchangeCodeForSession: vi.fn(async () => ({
        data: {
          session: {
            user: {
              email_confirmed_at: '2026-10-14T00:00:00.000Z',
              user_metadata: { auth_provider: 'joey' },
            },
          },
        },
        error: null,
      })),
      getSession: vi.fn(async () => ({
        data: {
          session: {
            user: {
              email_confirmed_at: '2026-10-14T00:00:00.000Z',
              user_metadata: { auth_provider: 'joey' },
            },
          },
        },
        error: null,
      })),
    });
    expect(await completeGoogleCallback(joey, '?code=pkce-code-1')).toEqual({
      status: 'signed-in',
      destination: '/balances',
    });
    expect(await completeGoogleCallback(joey, '')).toEqual({
      status: 'signed-in',
      destination: '/balances',
    });
  });

  it('fails a direct visit when no session exists', async () => {
    const client = auth({
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    });
    expect(await completeGoogleCallback(client, '')).toEqual({ status: 'failed' });
    expect(client.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('keeps a single Google entry point aimed at the configured Supabase project', () => {
    const oauth = read('src/integrations/supabase/oauth.ts');
    const callback = read('src/routes/auth_.callback.tsx');
    const callbackFlow = read('src/integrations/supabase/oauth-callback.ts');
    const client = read('src/integrations/supabase/client.ts');
    const reset = read('src/routes/reset-password.tsx');
    const profile = read(
      'supabase/migrations/20260807191411_12954a8b-0629-4cda-8dfe-101f7275d2d7.sql',
    );
    const mobile = read('mobile/src/app/sign-in.tsx');
    const expo = read('apps/mobile/src/auth.ts');
    expect(oauth).toContain("provider: 'google'");
    expect(oauth).toContain('redirectTo');
    expect(oauth).toContain('googleRedirectTo(origin)');
    expect(oauth).not.toContain('accounts.google.com');
    expect(oauth).not.toContain('signInWithIdToken');
    expect(callbackFlow).toContain('exchangeCodeForSession(params.code)');
    expect(callback).toContain('completeGoogleCallback');
    expect(callback).toContain('ssr: false');
    expect(callback).not.toContain('signInWithOAuth');
    expect(callback).not.toContain('startGoogleSignIn');
    expect(client).toContain("flowType: 'pkce'");
    expect(client).toContain('detectSessionInUrl: false');
    expect(reset).toContain('exchangeCodeForSession');
    expect(profile).toContain('auth.uid() = id');
    expect(profile).toContain('INSERT INTO public.profiles (id, display_name)');
    expect(profile).toContain("VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name')");
    expect(mobile).not.toContain('signInWithOAuth');
    expect(expo).not.toContain('signInWithOAuth');
    expect(expo).toContain('detectSessionInUrl: false');
  });
});
