import Storage from 'expo-sqlite/kv-store';
import { fetch } from 'expo/fetch';
import { AppState } from 'react-native';
import { useEffect, useSyncExternalStore } from 'react';
import {
  MARKET_LIST_URL,
  MARKET_XRP_URL,
  boundedJsonResponse,
  normalizeMarketPayload,
  validateMarketSnapshot,
} from '../../../src/ledgerly/native/market-data';
import {
  MarketClient,
  MarketRateLimit,
  createMarketViewRegistry,
  retryAfterMs,
} from '../../../src/ledgerly/native/market-client';

// Public first-party origin only. Provider credentials never enter this module.
const configuredOrigin = process.env.EXPO_PUBLIC_MARKET_API_ORIGIN;
export const marketApiOrigin = (() => {
  if (!configuredOrigin) return null;
  try {
    const url = new URL(configuredOrigin);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
})();

async function json(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    redirect: 'error',
    headers: { Accept: 'application/json', 'User-Agent': 'LedgerlyWallet/1.0' },
  });
  if (response.status === 429)
    throw new MarketRateLimit(retryAfterMs(response.headers.get('retry-after')));
  if (!response.ok) throw new Error('Market data is unavailable.');
  return boundedJsonResponse(response);
}

const client = new MarketClient(
  async (parentSignal) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    parentSignal.addEventListener('abort', abort, { once: true });
    if (parentSignal.aborted) controller.abort();
    const timeout = setTimeout(abort, 12_000);
    try {
      if (marketApiOrigin) {
        const snapshot = validateMarketSnapshot(
          await json(`${marketApiOrigin}/api/public/market/`, controller.signal),
        );
        if (!snapshot) throw new Error('Invalid market data.');
        return snapshot;
      }
      // Documented anonymous requests allow native display without a client key or
      // redistributing through our own backend. At most two requests per ten minutes, including manual refreshes.
      const [list, native] = await Promise.all([
        json(MARKET_LIST_URL, controller.signal),
        json(MARKET_XRP_URL, controller.signal),
      ]);
      return normalizeMarketPayload(list, Date.now(), native);
    } finally {
      clearTimeout(timeout);
      parentSignal.removeEventListener('abort', abort);
    }
  },
  Storage,
  Date.now,
  marketApiOrigin ? 60_000 : 600_000,
);

const views = createMarketViewRegistry(client);

export function useMarket() {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => {
    const connection = views.connect(() => AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', () => connection.sync());
    // Anonymous daily quota is 333 calls: two calls every ten minutes stays
    // below that ceiling even if a screen remains open for an entire day.
    const timer = setInterval(() => connection.sync(), marketApiOrigin ? 60_000 : 600_000);
    return () => {
      clearInterval(timer);
      subscription.remove();
      connection.disconnect();
    };
  }, []);
  return { ...state, refresh: client.refresh };
}

export function tokenLogoUrl(id: string | null): string | null {
  return marketApiOrigin && id && /^[0-9a-f]{32}$/.test(id)
    ? `${marketApiOrigin}/api/public/market/logo/${id}`
    : null;
}
