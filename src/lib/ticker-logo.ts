import { boundedJsonResponse, marketIdentity } from '@/ledgerly/native/market-data';

type TokenIdentity = { id: string; currency: string; issuer: string | null };

/** Public metadata is keyed by currency AND issuer, never by a shared symbol. */
export function tickerLogoPath(token: TokenIdentity): string {
  if (!token.issuer || marketIdentity(token.currency, token.issuer) !== token.id)
    throw new Error('Invalid token identity');
  return `https://s1.xrplmeta.org/v2/token/${encodeURIComponent(token.currency)}:${token.issuer}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeTickerLogo(payload: unknown, token: TokenIdentity): string {
  const data = record(payload);
  if (data?.currency !== token.currency || data?.issuer !== token.issuer)
    throw new Error('Token logo identity mismatch');
  const icon = record(record(data.meta)?.token)?.icon;
  if (
    typeof icon !== 'string' ||
    !/^https:\/\/s[12]\.xrplmeta\.org\/icon\/[A-Za-z0-9_-]+\.(?:png|webp|jpe?g)$/.test(icon)
  )
    throw new Error('Token logo unavailable');
  return icon;
}

/** Share queries across track copies and limit concurrent public metadata reads. */
export function createTickerLogoLoader(fetcher: typeof fetch = fetch) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async (token: TokenIdentity): Promise<string> => {
    const path = tickerLogoPath(token);
    if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      const response = await fetcher(path, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok || response.redirected) throw new Error('Token logo unavailable');
      return normalizeTickerLogo(await boundedJsonResponse(response), token);
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

export const loadTickerLogo = createTickerLogoLoader();
