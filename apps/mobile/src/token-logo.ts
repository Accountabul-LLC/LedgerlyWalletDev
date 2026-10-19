import { boundedJsonResponse, marketIdentity } from '../../../src/ledgerly/native/market-data';

/**
 * Issued-token artwork is not on the anonymous price payload. XRPL.to
 * `/thumb/{id}` answers 401 unless a server API key is sent, and the dev app
 * must not embed that key. XRPL Meta publishes the same kind of raster the
 * web ticker already accepts, with no key, on s1/s2.xrplmeta.org.
 */
const PUBLIC_ICON = /^https:\/\/s[12]\.xrplmeta\.org\/icon\/[A-Za-z0-9_-]+\.(?:png|webp|jpe?g)$/;
const FIRST_PARTY_LOGO = /^https:\/\/[^/?#@\s]+\/api\/public\/market\/logo\/[0-9a-f]{32}$/;
const SUCCESS_MS = 86_400_000;
const FAILURE_MS = 120_000;
const MAX_CACHE = 64;
const CONCURRENCY = 3;

export function isPublicTokenIcon(url: unknown): url is string {
  return typeof url === 'string' && PUBLIC_ICON.test(url);
}

/** Same shape as `tokenLogoUrl`: configured HTTPS origin, no query or userinfo. */
export function isFirstPartyMarketLogo(url: unknown): url is string {
  return typeof url === 'string' && FIRST_PARTY_LOGO.test(url);
}

export function tokenLogoMetadataUrl(currency: string, issuer: string | null): string | null {
  if (issuer === null || marketIdentity(currency, issuer) === null) return null;
  return `https://s1.xrplmeta.org/v2/token/${encodeURIComponent(currency)}:${issuer}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Accept only an icon whose metadata names this exact currency and issuer. */
export function tokenLogoFromMetadata(
  payload: unknown,
  currency: string,
  issuer: string,
): string | null {
  const data = record(payload);
  const icon = record(record(data?.meta)?.token)?.icon;
  if (!data || data.currency !== currency || data.issuer !== issuer || !isPublicTokenIcon(icon))
    return null;
  return icon;
}

export function tokenInitials(label: string): string {
  const compact = label
    .normalize('NFKD')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
  return compact.slice(0, 2) || '•';
}

export type LogoResponse = Pick<Response, 'ok' | 'redirected' | 'headers' | 'body'>;

export type LogoFetcher = (
  url: string,
  init: {
    signal: AbortSignal;
    redirect: 'error';
    headers: { Accept: string; 'User-Agent': string };
  },
) => Promise<LogoResponse>;

export function createTokenLogoLoader(fetcher: LogoFetcher, now: () => number = Date.now) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const cache = new Map<string, { url: string | null; until: number }>();
  const remember = (key: string, url: string | null, at: number) => {
    cache.delete(key);
    cache.set(key, { url, until: at + (url ? SUCCESS_MS : FAILURE_MS) });
    while (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };

  return async function loadTokenLogo(
    currency: string,
    issuer: string | null,
    parent: AbortSignal,
  ): Promise<string | null> {
    const meta = tokenLogoMetadataUrl(currency, issuer);
    if (!meta || issuer === null) return null;
    const cached = cache.get(meta);
    if (cached && cached.until > now()) return cached.url;
    if (parent.aborted) return null;
    if (active >= CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;

    const controller = new AbortController();
    const abort = () => controller.abort();
    parent.addEventListener('abort', abort, { once: true });
    if (parent.aborted) controller.abort();
    const timer = setTimeout(abort, 10_000);
    try {
      if (controller.signal.aborted) return null;
      const response = await fetcher(meta, {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': 'LedgerlyWallet/1.0' },
      });
      if (!response.ok || response.redirected) {
        await response.body?.cancel?.().catch(() => undefined);
        throw new Error('Token logo unavailable');
      }
      const icon = tokenLogoFromMetadata(await boundedJsonResponse(response), currency, issuer);
      if (!controller.signal.aborted) remember(meta, icon, now());
      return icon;
    } catch {
      if (!parent.aborted && !controller.signal.aborted) remember(meta, null, now());
      return null;
    } finally {
      clearTimeout(timer);
      parent.removeEventListener('abort', abort);
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}
