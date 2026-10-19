import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { searchTerm } from '@/lib/ingest-guards';

export interface DirectoryToken {
  currency: string;
  issuer: string;
  ticker: string;
  displayName: string | null;
  issuerName: string | null;
  logoUrl: string | null;
  holders: number;
  trustScore: number | null;
  lastSyncedAt: string;
}

const COLUMNS =
  'currency, issuer, ticker, display_name, issuer_name, logo_url, holders, trust_score, last_synced_at';

type Row = {
  currency: string;
  issuer: string;
  ticker: string;
  display_name: string | null;
  issuer_name: string | null;
  logo_url: string | null;
  holders: number;
  trust_score: number | null;
  last_synced_at: string;
};

function toToken(row: Row): DirectoryToken {
  return {
    currency: row.currency,
    issuer: row.issuer,
    ticker: row.ticker,
    displayName: row.display_name,
    issuerName: row.issuer_name,
    logoUrl: row.logo_url,
    holders: row.holders,
    trustScore: row.trust_score,
    lastSyncedAt: row.last_synced_at,
  };
}

function publicClient() {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY']!;
  return createClient<Database>(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
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

/**
 * Reads the cached token directory. Search is optional: with no query this
 * returns the most widely held Mainnet tokens.
 */
export const searchTokens = createServerFn({ method: 'GET' })
  .inputValidator((input: { query?: string } | undefined) => ({
    query: (input?.query ?? '').trim().slice(0, 64),
  }))
  .handler(async ({ data }): Promise<{ tokens: DirectoryToken[]; error: string | null }> => {
    try {
      const supabase = publicClient();
      let request = supabase
        .from('xrpl_tokens')
        .select(COLUMNS)
        .eq('is_active', true)
        .order('holders', { ascending: false })
        .limit(50);

      const term = searchTerm(data.query);
      if (term !== '') {
        request = request.or(
          `ticker.ilike.%${term}%,display_name.ilike.%${term}%,issuer_name.ilike.%${term}%,issuer.ilike.%${term}%`,
        );
      }

      const { data: rows, error } = await request;
      if (error) return { tokens: [], error: 'Token directory is unavailable right now.' };
      return { tokens: (rows ?? []).map((row) => toToken(row as Row)), error: null };
    } catch {
      return { tokens: [], error: 'Token directory is unavailable right now.' };
    }
  });
