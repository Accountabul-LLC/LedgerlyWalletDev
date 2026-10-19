import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicSupabaseConfig } from '@/integrations/supabase/config';

afterEach(() => vi.unstubAllEnvs());

describe('Supabase publishable authentication configuration', () => {
  it('requires explicit project coordinates instead of falling back to another database', () => {
    for (const name of [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
    ])
      vi.stubEnv(name, '');
    expect(() => getPublicSupabaseConfig()).toThrow(/Sign-in is temporarily unavailable/);
  });
  it('keeps a secret API key out of browser authentication', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_test');
    expect(() => getPublicSupabaseConfig()).toThrow(/server-only/);
  });
  it('rejects legacy service-role JWTs as well as new secret keys', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    const payload = btoa(JSON.stringify({ role: 'service_role' }));
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', `eyJhbGciOiJIUzI1NiJ9.${payload}.test`);
    expect(() => getPublicSupabaseConfig()).toThrow(/server-only/);
  });
  it('uses the configured public project without exposing server credentials', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co/');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    expect(getPublicSupabaseConfig()).toEqual({
      url: 'https://project.supabase.co',
      key: 'sb_publishable_test',
    });
  });
});
