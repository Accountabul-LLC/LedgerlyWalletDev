import { normalizeMarketPayload } from '@/ledgerly/native/market-data';

const ORIGIN = 'https://api.xrpl.to/v1';
const MINUTE = 60_000;
const MAX_LOGOS = 64;

/** A streaming cap also bounds chunked, compressed and dishonest Content-Length bodies. */
export async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing response body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error('Response too large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Return only supported raster formats whose declared dimensions are bounded. */
export function rasterType(bytes: Uint8Array, mime: string): string | null {
  const b = Buffer.from(bytes);
  const bounded = (w: number, h: number) => w > 0 && h > 0 && w <= 512 && h <= 512;
  if (
    mime === 'image/png' &&
    b.length >= 33 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.readUInt32BE(8) === 13 &&
    b.toString('ascii', 12, 16) === 'IHDR' &&
    bounded(b.readUInt32BE(16), b.readUInt32BE(20))
  )
    return mime;
  if (
    mime === 'image/webp' &&
    b.length >= 30 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.readUInt32LE(4) + 8 === b.length &&
    b.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const kind = b.toString('ascii', 12, 16);
    if (
      kind === 'VP8X' &&
      (b[20]! & 2) === 0 &&
      bounded(b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1)
    )
      return mime;
    if (
      kind === 'VP8 ' &&
      b[23] === 157 &&
      b[24] === 1 &&
      b[25] === 42 &&
      bounded(b.readUInt16LE(26) & 16383, b.readUInt16LE(28) & 16383)
    )
      return mime;
    if (
      kind === 'VP8L' &&
      b[20] === 47 &&
      bounded((b.readUInt32LE(21) & 16383) + 1, ((b.readUInt32LE(21) >>> 14) & 16383) + 1)
    )
      return mime;
  }
  if (
    mime === 'image/jpeg' &&
    b.length >= 4 &&
    b[0] === 255 &&
    b[1] === 216 &&
    b[b.length - 2] === 255 &&
    b[b.length - 1] === 217
  ) {
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p] !== 255) break;
      const marker = b[p + 1]!;
      if (marker === 218 || marker === 217) break;
      const size = b.readUInt16BE(p + 2);
      if (size < 2 || p + 2 + size > b.length) break;
      if (
        [192, 193, 194].includes(marker) &&
        size >= 8 &&
        bounded(b.readUInt16BE(p + 7), b.readUInt16BE(p + 5))
      )
        return mime;
      p += size + 2;
    }
  }
  return null;
}

export function createMarketProxy(fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  type Cached = { bytes: Uint8Array; type: string; until: number };
  const cache = new Map<string, Cached>();
  const flights = new Map<string, Promise<Cached>>();
  let blockedUntil = 0;
  let windowStart = now();
  let requests = 0;
  function allowed() {
    if (now() - windowStart >= MINUTE) {
      windowStart = now();
      requests = 0;
    }
    return ++requests <= 120;
  }
  async function upstream(path: string, logo = false): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: logo ? 'image/png,image/jpeg,image/webp' : 'application/json',
      'User-Agent': 'Ledgerly-Wallet/1.0 (public market display)',
    };
    const key = process.env.XRPL_TO_API_KEY;
    if (key) headers['X-Api-Key'] = key;
    const response = await fetcher(ORIGIN + path, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || response.redirected) {
      const retry = response.headers.get('retry-after');
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : 0;
      const dateDelay = retry ? (Date.parse(retry) - now()) / 1000 : 0;
      blockedUntil =
        now() +
        Math.min(300, Math.max(60, seconds, Number.isFinite(dateDelay) ? dateDelay : 0)) * 1000;
      await response.body?.cancel();
      throw new Error('Market provider unavailable');
    }
    return response;
  }
  async function load(id: string | null): Promise<Cached> {
    if (id) {
      const response = await upstream(`/thumb/${id}?w=64`, true);
      const bytes = await readBoundedBytes(response, 262_144);
      const type = rasterType(
        bytes,
        response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '',
      );
      if (!type) throw new Error('Unsupported logo');
      return { bytes, type, until: now() + MINUTE };
    }
    const responses = await Promise.all([
      upstream('/tokens?limit=20&sort=vol24hxrp'),
      upstream('/token/XRP'),
    ]);
    const payloads = await Promise.all(
      responses.map(async (response) => {
        if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
          await response.body?.cancel();
          throw new Error('Expected JSON');
        }
        return JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            await readBoundedBytes(response, 1_048_576),
          ),
        ) as unknown;
      }),
    );
    const snapshot = normalizeMarketPayload(payloads[0], now(), payloads[1]);
    if (snapshot.assets.length === 0) throw new Error('No valid market assets');
    return {
      bytes: new TextEncoder().encode(JSON.stringify(snapshot)),
      type: 'application/json',
      until: now() + MINUTE,
    };
  }
  return async function handle(request: Request, id: string | null = null): Promise<Response> {
    const base = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    };
    const error = (status: number, message: string) =>
      Response.json(
        { error: message },
        {
          status,
          headers: {
            ...base,
            ...(status === 429 || status === 503 ? { 'Retry-After': '60' } : {}),
          },
        },
      );
    if (process.env.XRPL_TO_REDISTRIBUTION_APPROVED !== 'true')
      return error(503, 'Market data unavailable');
    if (request.method !== 'GET') return error(405, 'Method not allowed');
    if (new URL(request.url).search) return error(400, 'Unexpected query');
    if (id !== null && !/^[a-f0-9]{32}$/.test(id)) return error(400, 'Invalid asset identity');
    if (!process.env.XRPL_TO_API_KEY) return error(503, 'Market data unavailable');
    if (!allowed()) return error(429, 'Too many requests');
    const key = id ?? 'snapshot';
    let result = cache.get(key);
    if (result && result.until <= now()) {
      cache.delete(key);
      result = undefined;
    }
    if (!result) {
      if (now() < blockedUntil) return error(503, 'Market data unavailable');
      let pending = flights.get(key);
      if (!pending) {
        if (flights.size >= 4) return error(429, 'Too many requests');
        pending = load(id);
        flights.set(key, pending);
      }
      try {
        result = await pending;
        cache.delete(key);
        cache.set(key, result);
        while (cache.size > MAX_LOGOS + 1) cache.delete(cache.keys().next().value!);
      } catch {
        blockedUntil = Math.max(blockedUntil, now() + MINUTE);
        return error(503, 'Market data unavailable');
      } finally {
        if (flights.get(key) === pending) flights.delete(key);
      }
    } else {
      cache.delete(key);
      cache.set(key, result);
    }
    return new Response(Buffer.from(result.bytes), {
      headers: {
        ...base,
        'Content-Type': result.type,
        'Cache-Control': 'public, max-age=30',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  };
}
export const marketProxy = createMarketProxy();
