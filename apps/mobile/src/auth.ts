import 'react-native-url-polyfill/auto';

import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isPublicSupabaseKey } from '../../../src/ledgerly/native/public-config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
};

let client: SupabaseClient | null = null;

/** New publishable API keys are not JWTs; never replace a real session bearer. */
function publicKeyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (key.startsWith('sb_publishable_') && headers.get('Authorization') === `Bearer ${key}`)
      headers.delete('Authorization');
    headers.set('apikey', key);
    return fetch(input, { ...init, headers });
  };
}

export function getAuthConfigurationError(): string | null {
  if (!supabaseUrl || !supabasePublishableKey) {
    return 'Ledgerly account sign-in is not configured in this build.';
  }
  if (!isPublicSupabaseKey(supabasePublishableKey))
    return 'Ledgerly sign-in requires a public Supabase key in this build.';
  return null;
}

export function getSupabaseClient(): SupabaseClient {
  const configurationError = getAuthConfigurationError();
  if (configurationError || !supabaseUrl || !supabasePublishableKey) {
    throw new Error(configurationError ?? 'Ledgerly account sign-in is unavailable.');
  }

  client ??= createClient(supabaseUrl, supabasePublishableKey, {
    global: { fetch: publicKeyFetch(supabasePublishableKey) },
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      // supabase-js 2.112 coordinates refreshes without a mutex. processLock is the
      // deprecated opt-in, and its non-blocking auto-refresh acquire logs
      // "timed out after 0ms" when that tick overlaps the startup getSession().
      detectSessionInUrl: false,
    },
  });

  return client;
}
