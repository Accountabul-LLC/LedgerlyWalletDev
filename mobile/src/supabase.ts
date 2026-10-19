import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createAuthStorage } from './auth-storage';
import { createClient } from '@supabase/supabase-js';
import { isPublicSupabaseKey } from '../../src/ledgerly/native/public-config';

/**
 * Every build reads its Supabase coordinates from the environment only
 * (EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, set as EAS environment
 * variables per profile or in an ignored .env.local). There is no built-in fallback: a build fails
 * closed when either is missing, and a test build refuses the production project.
 */
const PRODUCTION_SUPABASE_REF = 'srvzinigfedppxwypmtt';
export const IS_TEST_BACKEND_BUILD = process.env.EXPO_PUBLIC_LEDGERLY_BACKEND?.trim() === 'test';
const envSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const envSupabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!envSupabaseUrl || !envSupabaseKey)
  throw new Error('This build is missing its Ledgerly profile backend configuration.');

export const PUBLIC_SUPABASE_URL: string = envSupabaseUrl;
export const PUBLIC_SUPABASE_PUBLISHABLE_KEY: string = envSupabaseKey;
if (IS_TEST_BACKEND_BUILD && PUBLIC_SUPABASE_URL.includes(PRODUCTION_SUPABASE_REF))
  throw new Error('This test build must not use the production Ledgerly profile backend.');
if (!isPublicSupabaseKey(PUBLIC_SUPABASE_PUBLISHABLE_KEY))
  throw new Error('Ledgerly sign-in requires a public Supabase key in this build.');

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get('Authorization') === `Bearer ${supabaseKey}`
    ) {
      headers.delete('Authorization');
    }
    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

const AUTH_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'ledgerly.profile-auth',
};
async function requireSecureAuthStore(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync()))
    throw new Error('Secure session storage unavailable');
}
const authStorage = createAuthStorage(
  {
    async get(key) {
      await requireSecureAuthStore();
      return SecureStore.getItemAsync(key, AUTH_OPTIONS);
    },
    async set(key, value) {
      await requireSecureAuthStore();
      await SecureStore.setItemAsync(key, value, AUTH_OPTIONS);
    },
    async remove(key) {
      await requireSecureAuthStore();
      await SecureStore.deleteItemAsync(key, AUTH_OPTIONS);
    },
  },
  AsyncStorage,
);

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: createSupabaseFetch(PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  },
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
