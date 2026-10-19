import { createClient, type EmailOtpType } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { getPublicSupabaseConfig } from '@/integrations/supabase/config';
import { confirmEmailWithAuth } from '@/lib/confirm-email';

function confirmationClient() {
  const { url, key } = getPublicSupabaseConfig();
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) {
          headers.delete('Authorization');
        }
        headers.set('apikey', key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Server-only verifyOtp. Uses the publishable key, never the service role. */
export async function confirmEmailOnServer(input: { tokenHash: string; type: string }) {
  const supabase = confirmationClient();
  return confirmEmailWithAuth(
    {
      verifyOtp: (args) =>
        supabase.auth.verifyOtp({
          token_hash: args.token_hash,
          type: args.type as EmailOtpType,
        }),
    },
    input,
  );
}
