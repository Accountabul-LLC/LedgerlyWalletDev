import { md5 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { isValidClassicAddress } from 'ripple-address-codec';

export const MARKET_LIMIT = 20;
export const MARKET_TTL_MS = 60_000;
export const MARKET_OFFLINE_MS = 86_400_000;
export const MARKET_ATTRIBUTION = 'Data by xrpl.to';
export const MARKET_PROVIDER_URL = 'https://xrpl.to';
export const MARKET_LIST_URL = 'https://api.xrpl.to/v1/tokens?limit=20&sort=vol24hxrp';
export const MARKET_XRP_URL = 'https://api.xrpl.to/v1/token/XRP';

export interface MarketAsset {
  id: string;
  currency: string;
  issuer: string | null;
  ticker: string;
  name: string;
  priceUsd: string | null;
  change24h: number | null;
  quotedAt: number | null;
}

export interface MarketSnapshot {
  version: 1;
  source: 'xrpl.to';
  fetchedAt: number;
  assets: MarketAsset[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function label(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // Remove control and direction overrides; metadata is plain text, never markup.
  const text = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim()
    .slice(0, max);
  return text || null;
}

/** MD5 is a provider identifier only, never a wallet cryptographic primitive. */
export function marketIdentity(currency: unknown, issuer: unknown): string | null {
  if (currency === 'XRP' && (issuer === null || issuer === 'XRPL')) {
    return '84e5efeb89c4eae8f68188982dc290d8';
  }
  if (
    typeof currency !== 'string' ||
    currency === 'XRP' ||
    !/^(?:[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}|[0-9a-fA-F]{40})$/.test(currency) ||
    typeof issuer !== 'string' ||
    issuer.length > 35 ||
    !isValidClassicAddress(issuer)
  )
    return null;
  return bytesToHex(md5(new TextEncoder().encode(`${issuer}_${currency}`)));
}

function price(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  if (text.length > 96 || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1e20 ? text : null;
}

function change(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (String(value).trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && Math.abs(numeric) <= 1e6 ? numeric : null;
}

function timestamp(value: unknown, now: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now + 300_000
    ? value
    : null;
}

function normalizeAsset(value: unknown, now: number): MarketAsset | null {
  const row = record(value);
  if (!row) return null;
  const id = marketIdentity(row.currency, row.issuer);
  const ticker = label(row.name, 24);
  if (!id || row.md5 !== id || !ticker) return null;
  return {
    id,
    currency: row.currency as string,
    issuer: row.issuer === 'XRPL' ? null : (row.issuer as string),
    ticker,
    name: label(row.user, 64) ?? ticker,
    priceUsd: price(row.usd),
    // pro24h is the documented percent field. p24h is not a percent.
    change24h: change(row.pro24h),
    quotedAt: timestamp(row.time, now),
  };
}

export function normalizeMarketPayload(
  payload: unknown,
  fetchedAt = Date.now(),
  nativePayload?: unknown,
  limit = MARKET_LIMIT,
): MarketSnapshot {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid market limit.');
  const list = record(payload);
  if (list?.success !== true || !Array.isArray(list.tokens)) {
    throw new Error('Market data is unavailable.');
  }
  const native = record(nativePayload);
  const rows = list.tokens.slice(0, limit);
  if (native?.success === true) rows.unshift(native.token);
  const assets = new Map<string, MarketAsset>();
  for (const row of rows) {
    const asset = normalizeAsset(row, fetchedAt);
    if (asset && !assets.has(asset.id)) assets.set(asset.id, asset);
  }
  if (assets.size === 0) throw new Error('Market data is unavailable.');
  return { version: 1, source: 'xrpl.to', fetchedAt, assets: [...assets.values()] };
}

/** Revalidate disk cache and first-party proxy responses just like external data. */
export function validateMarketSnapshot(value: unknown, now = Date.now()): MarketSnapshot | null {
  const snapshot = record(value);
  if (
    snapshot?.version !== 1 ||
    snapshot.source !== 'xrpl.to' ||
    typeof snapshot.fetchedAt !== 'number' ||
    !Number.isFinite(snapshot.fetchedAt) ||
    snapshot.fetchedAt <= 0 ||
    snapshot.fetchedAt > now + 300_000 ||
    now - snapshot.fetchedAt > MARKET_OFFLINE_MS ||
    !Array.isArray(snapshot.assets) ||
    snapshot.assets.length > MARKET_LIMIT + 1
  )
    return null;
  const assets: MarketAsset[] = [];
  const seen = new Set<string>();
  for (const value of snapshot.assets) {
    const row = record(value);
    const identity = row ? marketIdentity(row.currency, row.issuer) : null;
    if (!row || !identity || typeof row.id !== 'string' || row.id !== identity || seen.has(row.id))
      return null;
    const ticker = label(row.ticker, 24);
    const name = label(row.name, 64);
    if (!ticker || !name) return null;
    seen.add(String(row.id));
    assets.push({
      id: row.id as string,
      currency: row.currency as string,
      issuer: row.issuer as string | null,
      ticker,
      name,
      priceUsd: price(row.priceUsd),
      change24h: change(row.change24h),
      quotedAt: timestamp(row.quotedAt, now),
    });
  }
  return assets.length
    ? { version: 1, source: 'xrpl.to', fetchedAt: snapshot.fetchedAt, assets }
    : null;
}

/** Bound the stream before parsing; never buffer an unbounded provider body. */
export async function boundedJsonResponse(
  response: Pick<Response, 'headers' | 'body'>,
  maxBytes = 1_048_576,
): Promise<unknown> {
  if (!(response.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new Error('Unexpected market response.');
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new Error('Market response is too large.');
  if (!response.body) throw new Error('Market response is empty.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Market response is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
