import {
  boundedJsonResponse,
  normalizeMarketPayload,
  MARKET_XRP_URL,
} from '@/ledgerly/native/market-data';
import { MarketRateLimit, retryAfterMs } from '@/ledgerly/native/market-client';

export const TICKER_REFRESH_MS = 300_000;
export const TICKER_MAX_AGE_MS = 1_800_000;
export const TICKER_LIMIT = 50;
export const TICKER_LIST_URL = 'https://api.xrpl.to/v1/tokens?limit=50&sort=vol24hxrp';
const XRP_ID = '84e5efeb89c4eae8f68188982dc290d8';
export interface TickerQuote {
  id: string;
  currency: string;
  issuer: string | null;
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  updatedAt: string | null;
}
export interface TickerSnapshot {
  source: 'xrpl.to';
  fetchedAt: number;
  quotes: TickerQuote[];
}

/** Issuer/currency validation is shared with the existing XRPL market adapter. */
export function normalizeTickerQuotes(
  payload: unknown,
  nativePayload: unknown,
  now = Date.now(),
): TickerSnapshot {
  // Native XRP plus the highest-volume issued tokens, capped at 50 identities.
  const market = normalizeMarketPayload(payload, now, nativePayload, TICKER_LIMIT);
  const native = market.assets.find((asset) => asset.id === XRP_ID);
  const fresh = (time: number | null) =>
    time !== null && now - time <= TICKER_MAX_AGE_MS && time <= now + 300_000;
  const xrpChange = native && fresh(native.quotedAt) ? native.change24h : null;
  const quotes: TickerQuote[] = [];
  for (const asset of market.assets) {
    // Issued-token pro24h tracks its XRP rate; XRP's own pro24h tracks USD.
    // Compose the two returns so the daily change uses the same currency as the price.
    let change = asset.change24h;
    if (asset.id !== XRP_ID) {
      change =
        change !== null && xrpChange !== null && change >= -100 && xrpChange >= -100
          ? ((1 + change / 100) * (1 + xrpChange / 100) - 1) * 100
          : null;
    }
    if (change !== null && (!Number.isFinite(change) || change < -100 || change > 1e6))
      change = null;
    quotes.push({
      id: asset.id,
      currency: asset.currency,
      issuer: asset.issuer,
      symbol: asset.ticker,
      name: asset.name,
      priceUsd: asset.priceUsd !== null && fresh(asset.quotedAt) ? Number(asset.priceUsd) : null,
      change24h: fresh(asset.quotedAt) ? change : null,
      updatedAt: asset.quotedAt === null ? null : new Date(asset.quotedAt).toISOString(),
    });
  }
  if (!quotes.length) throw new Error('Token prices unavailable');
  return { source: 'xrpl.to', fetchedAt: now, quotes: quotes.slice(0, TICKER_LIMIT) };
}

/** Anonymous browser reads only. No key, wallet data, persistent cache or re-serving API. */
export function createTickerLoader(fetcher: typeof fetch = fetch, now = Date.now) {
  let retryAt = 0;
  return async (signal: AbortSignal): Promise<TickerSnapshot> => {
    if (now() < retryAt) throw new MarketRateLimit(retryAt - now());
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(8_000)]);
    const responses = await Promise.all(
      [TICKER_LIST_URL, MARKET_XRP_URL].map(async (url) => {
        const response = await fetcher(url, {
          signal: requestSignal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          redirect: 'error',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok || response.redirected) {
          const delay =
            response.status === 429
              ? retryAfterMs(response.headers.get('retry-after'), now())
              : 60_000;
          retryAt = Math.max(retryAt, now() + delay);
          await response.body?.cancel();
          throw new MarketRateLimit(delay);
        }
        return boundedJsonResponse(response);
      }),
    );
    return normalizeTickerQuotes(responses[0], responses[1], now());
  };
}
export const loadTickerQuotes = createTickerLoader();

export function formatTickerPrice(value: number): string {
  if (value > 0 && value < 0.00000001) return '<$0.00000001';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value >= 1 ? 2 : 8,
  }).format(value);
}

export function formatTickerChange(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}%`;
}
