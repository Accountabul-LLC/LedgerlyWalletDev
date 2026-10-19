import { supabase } from './client';
import { getPublicSupabaseConfig } from './config';

/**
 * Supabase's redirectTo, which is where the browser returns after Google.
 * Google's own redirect_uri stays on the Supabase project and is not set here.
 */
export function googleRedirectTo(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('Could not start Google sign-in.');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const allowedProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && local);
  if (!allowedProtocol || url.origin !== origin) throw new Error('Could not start Google sign-in.');
  return `${url.origin}/auth/callback`;
}

/** Check configuration before redirecting, so a disabled provider keeps the user on the sign-in page. */
export async function startGoogleSignIn(origin: string): Promise<void> {
  const redirectTo = googleRedirectTo(origin);
  const { url, key } = getPublicSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
    credentials: 'omit',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error('Could not check Google sign-in. Please try again or use email.');
  const settings = (await response.json()) as { external?: { google?: boolean } };
  if (settings.external?.google !== true)
    throw new Error('Google sign-in is temporarily unavailable. Please try again or use email.');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url || new URL(data.url).origin !== new URL(url).origin)
    throw new Error('Could not start Google sign-in.');
  window.location.assign(data.url);
}
