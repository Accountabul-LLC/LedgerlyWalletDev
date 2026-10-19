import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarketProxy, rasterType, readBoundedBytes } from '../../src/lib/market.server';
import { safeImageUrl } from '../../src/lib/ingest-guards';

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }));
const database = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({ error: null })),
  lt: vi.fn(() => ({ eq: async () => ({ error: null }) })),
}));
vi.mock('../../src/integrations/supabase/client.server', () => ({
  supabaseAdmin: { from: () => ({ upsert: database.upsert, update: () => ({ lt: database.lt }) }) },
}));
import { Route as SyncRoute } from '../../src/routes/api/public/tokens/sync';
const syncPost = (
  SyncRoute as unknown as {
    server: { handlers: { POST: (input: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;
const ID = 'a'.repeat(32);
const req = () => new Request('https://ledgerly.example/api/public/market/');
function png(width = 64, height = 64) {
  const b = Buffer.alloc(33);
  b.set([137, 80, 78, 71, 13, 10, 26, 10]);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
function logoResponse() {
  return new Response(png(), { headers: { 'content-type': 'image/png' } });
}

describe('market server boundary', () => {
  beforeEach(() => {
    vi.stubEnv('XRPL_TO_REDISTRIBUTION_APPROVED', 'true');
    vi.stubEnv('XRPL_TO_API_KEY', 'test-server-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it('fails closed before any upstream call without permission or server credentials', async () => {
    const f = vi.fn();
    const handle = createMarketProxy(f);
    vi.stubEnv('XRPL_TO_REDISTRIBUTION_APPROVED', 'false');
    expect((await handle(req())).status).toBe(503);
    vi.stubEnv('XRPL_TO_REDISTRIBUTION_APPROVED', 'true');
    vi.stubEnv('XRPL_TO_API_KEY', '');
    expect((await handle(req())).status).toBe(503);
    expect((await handle(req(), ID)).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects hostile identifiers and arbitrary upstream queries', async () => {
    const f = vi.fn();
    const handle = createMarketProxy(f);
    for (const id of ['../../token/XRP', 'https://internal', 'rAccount', ID.toUpperCase(), '']) {
      expect((await handle(req(), id)).status).toBe(400);
    }
    expect((await handle(new Request(req().url + '?url=https://internal'))).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it('uses fixed URL/header credentials, deduplicates requests and caches raster data', async () => {
    const f = vi.fn(async () => logoResponse());
    const handle = createMarketProxy(f);
    const responses = await Promise.all([handle(req(), ID), handle(req(), ID), handle(req(), ID)]);
    expect(responses.map((x) => x.status)).toEqual([200, 200, 200]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]?.[0]).toBe(`https://api.xrpl.to/v1/thumb/${ID}?w=64`);
    expect(f.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      headers: { 'X-Api-Key': 'test-server-key' },
    });
    expect((await handle(req(), ID)).headers.get('x-content-type-options')).toBe('nosniff');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('honors provider Retry-After without exposing provider response or keys', async () => {
    let time = 1000;
    const f = vi.fn(
      async () =>
        new Response('secret-provider-error', { status: 429, headers: { 'retry-after': '120' } }),
    );
    const handle = createMarketProxy(f, () => time);
    const first = await handle(req(), ID);
    expect(first.status).toBe(503);
    expect(await first.text()).not.toContain('secret');
    time += 61_000;
    await handle(req(), ID);
    expect(f).toHaveBeenCalledTimes(1);
    time += 60_000;
    await handle(req(), ID);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('rejects SVG, HTML, spoofed rasters, excessive dimensions and redirected success', async () => {
    for (const response of [
      new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
      new Response('<html/>', { headers: { 'content-type': 'image/png' } }),
      new Response(png(513), { headers: { 'content-type': 'image/png' } }),
    ]) {
      expect((await createMarketProxy(vi.fn(async () => response))(req(), ID)).status).toBe(503);
    }
    const response = logoResponse();
    Object.defineProperty(response, 'redirected', { value: true });
    expect((await createMarketProxy(vi.fn(async () => response))(req(), ID)).status).toBe(503);
    expect(rasterType(png(), 'image/svg+xml')).toBeNull();
  });
  it('bounds client request load even when content is already cached', async () => {
    const f = vi.fn(async () => logoResponse());
    const handle = createMarketProxy(f);
    for (let n = 0; n < 120; n++) expect((await handle(req(), ID)).status).toBe(200);
    expect((await handle(req(), ID)).status).toBe(429);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('streams a byte cap rather than trusting absent or dishonest lengths', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(10));
          controller.enqueue(new Uint8Array(10));
          controller.close();
        },
      }),
      { headers: { 'content-length': '1' } },
    );
    await expect(readBoundedBytes(response, 15)).rejects.toThrow('too large');
    await expect(
      readBoundedBytes(new Response('x', { headers: { 'content-length': '100' } }), 15),
    ).rejects.toThrow('too large');
  });
  it('does not admit credentials, private literals, local hosts, SVG or non-HTTPS image URLs', () => {
    for (const url of [
      'https://user:pass@example.com/a.png',
      'https://127.1/a.png',
      'https://2130706433/a.png',
      'https://[::1]/a.png',
      'https://10.0.0.1/a.png',
      'https://localhost/a.png',
      'https://x.internal/a.png',
      'https://x.localhost./a.png',
      'https://example.com/logo.sv%67',
      'https://example.com:444/a.png',
      'https://example.com/logo.svg',
      'https://example.com/a.png#x',
      'data:image/png,x',
    ]) {
      expect(safeImageUrl(url)).toBeNull();
    }
    expect(safeImageUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });
  it('skips null/array/malformed token directory rows without throwing or writing', async () => {
    vi.stubEnv('TOKEN_SYNC_SECRET', 'test-sync-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([null, [], 123, {}, { meta: null }])),
    );
    const response = await syncPost({
      request: new Request('https://ledgerly.example/api/public/tokens/sync', {
        method: 'POST',
        headers: { 'x-token-sync-secret': 'test-sync-secret' },
      }),
    });
    expect(response.status).toBe(502);
    expect(database.upsert).not.toHaveBeenCalled();
  });
  it('sanitizes malformed nested metadata and blocks credential-bearing token logos', async () => {
    vi.stubEnv('TOKEN_SYNC_SECRET', 'test-sync-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          null,
          {
            currency: 'USD',
            issuer: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
            code: 'USD',
            meta: null,
            IssuingAccount: null,
          },
          {
            currency: 'EUR',
            issuer: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
            code: 'EUR',
            meta: { token: { icon: 'https://user:pass@cdn.example.com/a.png' }, issuer: null },
          },
        ]),
      ),
    );
    const response = await syncPost({
      request: new Request('https://ledgerly.example/api/public/tokens/sync', {
        method: 'POST',
        headers: { 'x-token-sync-secret': 'test-sync-secret' },
      }),
    });
    expect(response.status).toBe(200);
    expect(database.upsert.mock.calls[0]?.[0]).toMatchObject([
      { logo_url: null, display_name: null },
      { logo_url: null },
    ]);
  });

  it('normalizes snapshots without exposing upstream metadata or provider credentials', async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      Response.json(
        String(url).includes('/tokens?')
          ? { success: true, tokens: [] }
          : {
              success: true,
              token: {
                currency: 'XRP',
                issuer: 'XRPL',
                md5: '84e5efeb89c4eae8f68188982dc290d8',
                name: 'XRP',
                usd: '1.25',
                pro24h: '3',
                secret: 'test-server-key',
                url: 'https://internal',
              },
            },
      ),
    );
    const handle = createMarketProxy(f);
    const response = await handle(req());
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('test-server-key');
    expect(text).not.toContain('internal');
    const data = JSON.parse(text);
    expect(data.assets[0]).toMatchObject({
      currency: 'XRP',
      issuer: null,
      priceUsd: '1.25',
      change24h: 3,
    });
    await handle(req());
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('limits distinct logo work to four concurrent provider requests', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = vi.fn(async () => {
      await gate;
      return logoResponse();
    });
    const handle = createMarketProxy(f);
    const active = [1, 2, 3, 4].map((n) => handle(req(), n.toString(16).padStart(32, '0')));
    expect((await handle(req(), '5'.padStart(32, '0'))).status).toBe(429);
    release();
    expect((await Promise.all(active)).every((response) => response.status === 200)).toBe(true);
    expect(f).toHaveBeenCalledTimes(4);
  });
  it('evicts the oldest cached logo once the fixed cache bound is reached', async () => {
    const f = vi.fn(async () => logoResponse());
    const handle = createMarketProxy(f);
    for (let n = 0; n < 66; n++) await handle(req(), n.toString(16).padStart(32, '0'));
    await handle(req(), '0'.repeat(32));
    expect(f).toHaveBeenCalledTimes(67);
  });
});
