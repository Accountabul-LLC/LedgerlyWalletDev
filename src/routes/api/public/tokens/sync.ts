import { createFileRoute } from '@tanstack/react-router';
import { readBoundedBytes } from '@/lib/market.server';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  boundedInt,
  boundedText,
  isLedgerAddress,
  isLedgerCurrency,
  safeImageUrl,
} from '@/lib/ingest-guards';

/** Constant-time compare over fixed-length digests, so no timing leak. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/**
 * Refreshes the cached XRPL token directory.
 *
 * Called on a schedule with a private token-sync secret. It pulls the most
 * widely held Mainnet tokens from XRPScan's public index and upserts them.
 * Rows that stop appearing upstream are marked inactive instead of deleted,
 * so nothing disappears from someone's screen mid-session.
 */

interface UpstreamToken {
  currency?: string;
  code?: string;
  issuer?: string;
  holders?: number;
  score?: number;
  disabled?: boolean;
  meta?: {
    token?: { name?: string; icon?: string; trust_level?: number };
    issuer?: { name?: string; icon?: string; trust_level?: number };
  };
  IssuingAccount?: { name?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function sanitizeUpstreamToken(value: Record<string, unknown>): UpstreamToken {
  const meta = isRecord(value.meta) ? value.meta : {};
  return {
    ...value,
    meta: {
      token: isRecord(meta.token) ? meta.token : {},
      issuer: isRecord(meta.issuer) ? meta.issuer : {},
    },
    IssuingAccount: isRecord(value.IssuingAccount) ? value.IssuingAccount : {},
  } as UpstreamToken;
}

/**
 * Nothing from the upstream index is trusted. Every field is shape-checked and
 * length-bounded by the shared ingest guards before it reaches the database,
 * so a compromised or sloppy third-party feed cannot push unbounded text, a
 * hostile URL, or a junk row into a table the whole site reads.
 */

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

export const Route = createFileRoute('/api/public/tokens/sync')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),

      POST: async ({ request }) => {
        // The publishable key ships in the browser bundle, so it can never gate
        // this write. Accept the host environment or the token-sync row in
        // cron_tokens. That row is the secret created for this database.
        const provided =
          request.headers.get('x-token-sync-secret') ??
          request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
          '';
        let authorized = false;
        const fromEnv = process.env['TOKEN_SYNC_SECRET'];
        if (provided && fromEnv) authorized = secretMatches(provided, fromEnv);
        if (provided && !authorized) {
          try {
            const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
            const { data } = await supabaseAdmin
              .from('cron_tokens')
              .select('token')
              .eq('name', 'token-sync')
              .maybeSingle();
            if (typeof data?.token === 'string' && data.token)
              authorized = secretMatches(provided, data.token);
          } catch {
            // A database hiccup must not turn into an open endpoint.
          }
        }
        if (!authorized) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: JSON_HEADERS,
          });
        }

        let upstream: UpstreamToken[] = [];
        try {
          const response = await fetch('https://api.xrpscan.com/api/v1/tokens?limit=250', {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
            redirect: 'error',
          });
          if (!response.ok || response.redirected) throw new Error(`upstream ${response.status}`);
          if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? ''))
            throw new Error('upstream not JSON');
          const payload: unknown = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(
              await readBoundedBytes(response, 1_048_576),
            ),
          );
          if (!Array.isArray(payload)) throw new Error('upstream payload was not a list');
          // Hard cap so a runaway feed cannot drive an unbounded write.
          upstream = payload.slice(0, 1000).filter(isRecord).map(sanitizeUpstreamToken);
        } catch (error) {
          console.error('token sync fetch failed', error);
          return new Response(JSON.stringify({ error: 'Upstream token index unavailable' }), {
            status: 502,
            headers: JSON_HEADERS,
          });
        }

        const now = new Date().toISOString();
        const rows = upstream
          .filter(
            (token) =>
              isLedgerCurrency(token.currency) &&
              isLedgerAddress(token.issuer) &&
              token.disabled !== true,
          )
          .map((token) => ({
            currency: token.currency!,
            issuer: token.issuer!,
            ticker: boundedText(token.code ?? token.meta?.token?.name ?? token.currency!, 24) ?? '',
            display_name: boundedText(token.meta?.token?.name, 64),
            issuer_name: boundedText(token.meta?.issuer?.name ?? token.IssuingAccount?.name, 64),
            logo_url: safeImageUrl(token.meta?.token?.icon ?? token.meta?.issuer?.icon),
            holders: boundedInt(token.holders, 0, 1_000_000_000),
            trust_score:
              token.meta?.token?.trust_level == null
                ? null
                : boundedInt(token.meta.token.trust_level, 0, 100),
            source: 'xrpscan',
            is_active: true,
            last_synced_at: now,
          }))
          .filter((row) => row.ticker !== '');

        if (rows.length === 0) {
          return new Response(JSON.stringify({ error: 'Upstream returned no tokens' }), {
            status: 502,
            headers: JSON_HEADERS,
          });
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

        const { error: upsertError } = await supabaseAdmin
          .from('xrpl_tokens')
          .upsert(rows, { onConflict: 'currency,issuer' });
        if (upsertError) {
          console.error('token sync upsert failed', upsertError);
          return new Response(JSON.stringify({ error: 'Could not store tokens' }), {
            status: 500,
            headers: JSON_HEADERS,
          });
        }

        // Anything not seen in this run stays in the table but stops showing up.
        const { error: staleError } = await supabaseAdmin
          .from('xrpl_tokens')
          .update({ is_active: false })
          .lt('last_synced_at', now)
          .eq('is_active', true);
        if (staleError) console.error('token sync stale sweep failed', staleError);

        return new Response(JSON.stringify({ ok: true, synced: rows.length, at: now }), {
          headers: JSON_HEADERS,
        });
      },
    },
  },
});
