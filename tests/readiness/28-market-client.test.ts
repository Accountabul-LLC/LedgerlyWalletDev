import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { md5 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  boundedJsonResponse,
  marketIdentity,
  normalizeMarketPayload,
  validateMarketSnapshot,
  MARKET_OFFLINE_MS,
  type MarketSnapshot,
} from '../../src/ledgerly/native/market-data';
import {
  MarketClient,
  MarketRateLimit,
  createMarketViewRegistry,
  retryAfterMs,
} from '../../src/ledgerly/native/market-client';
import { signOutAndLock } from '../../src/ledgerly/native/signout';

const issuer = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const currency = 'USD';
const id = bytesToHex(md5(new TextEncoder().encode(`${issuer}_${currency}`)));
const row = {
  md5: id,
  issuer,
  currency,
  name: 'USD',
  user: 'Synthetic issuer',
  usd: '1.25',
  pro24h: '-2.5',
  p24h: 99,
  time: 1000,
};
const snapshot = (now: number): MarketSnapshot =>
  normalizeMarketPayload({ success: true, tokens: [row] }, now);
const cache = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe('native market data boundary', () => {
  it('matches logos by checksum-valid issuer and exact currency, never ticker', () => {
    expect(marketIdentity(currency, issuer)).toBe(id);
    expect(marketIdentity(currency, issuer.slice(0, -1) + '1')).toBeNull();
    expect(marketIdentity('XRP', issuer)).toBeNull();
    expect(marketIdentity('XRP', null)).toBe('84e5efeb89c4eae8f68188982dc290d8');
    const result = normalizeMarketPayload(
      {
        success: true,
        tokens: [
          null,
          [],
          { ...row, issuer: 'not-an-address' },
          { ...row, md5: '0'.repeat(32) },
          row,
          row,
        ],
      },
      1000,
    );
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].change24h).toBe(-2.5);
  });

  it('removes text direction/control overrides, caps rows, drops nonfinite prices', () => {
    const result = normalizeMarketPayload(
      {
        success: true,
        tokens: [
          {
            ...row,
            name: 'US\u202eD\u0000',
            usd: 'Infinity',
            pro24h: 'NaN',
            image: 'javascript:alert(1)',
          },
        ],
      },
      1000,
    );
    expect(result.assets[0]).toMatchObject({ ticker: 'USD', priceUsd: null, change24h: null });
    expect(result.assets[0]).not.toHaveProperty('image');
    expect(
      normalizeMarketPayload({ success: true, tokens: Array(10000).fill(row) }, 1000).assets,
    ).toHaveLength(1);
  });

  it('revalidates cache identities and timestamps; never treats missing values as zero', () => {
    const value = snapshot(1000);
    expect(validateMarketSnapshot(value, 1000)).toEqual(value);
    expect(validateMarketSnapshot({ ...value, fetchedAt: Infinity }, 1000)).toBeNull();
    expect(validateMarketSnapshot({ ...value, fetchedAt: 0 }, 1000)).toBeNull();
    expect(
      validateMarketSnapshot(
        {
          ...value,
          assets: [{ id: null, currency: 'INVALID', issuer: null, ticker: 'X', name: 'X' }],
        },
        1000,
      ),
    ).toBeNull();
    expect(validateMarketSnapshot(value, 1000 + MARKET_OFFLINE_MS + 1)).toBeNull();
    expect(
      validateMarketSnapshot({ ...value, assets: [{ ...value.assets[0], id: 'fake' }] }, 1000),
    ).toBeNull();
    expect(
      normalizeMarketPayload({ success: true, tokens: [{ ...row, usd: null, pro24h: null }] }, 1000)
        .assets[0].priceUsd,
    ).toBeNull();
  });

  it('bounds streamed response bytes and rejects non-JSON before parsing', async () => {
    await expect(
      boundedJsonResponse(
        new Response('x'.repeat(100), { headers: { 'content-type': 'application/json' } }),
        20,
      ),
    ).rejects.toThrow('too large');
    await expect(
      boundedJsonResponse(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })),
    ).rejects.toThrow('Unexpected');
    expect(await boundedJsonResponse(Response.json({ success: true }))).toEqual({ success: true });
  });

  it('shares in-flight requests and persists only validated public prices', async () => {
    let calls = 0;
    const storage = cache();
    const client = new MarketClient(
      async () => {
        calls++;
        return snapshot(1000);
      },
      storage,
      () => 1000,
    );
    const unsubscribe = client.subscribe(() => {});
    await Promise.all([client.refresh(), client.refresh()]);
    await client.refresh();
    expect(calls).toBe(1);
    expect(client.getSnapshot()).toMatchObject({ loading: false, saved: false, error: null });
    expect(storage.values.size).toBe(1);
    unsubscribe();
  });

  it('keeps explicitly saved prices offline and honours 429 cooldown', async () => {
    let now = 61_001;
    let calls = 0;
    const storage = cache();
    storage.values.set('ledgerly.market.v1', JSON.stringify(snapshot(1000)));
    const client = new MarketClient(
      async () => {
        calls++;
        throw new MarketRateLimit(120_000);
      },
      storage,
      () => now,
    );
    await client.refresh();
    await client.refresh();
    expect(calls).toBe(1);
    expect(client.getSnapshot()).toMatchObject({
      saved: true,
      loading: false,
      snapshot: snapshot(1000),
    });
    now += 120_001;
    await client.refresh();
    expect(calls).toBe(2);
    expect(retryAfterMs('120', now)).toBe(120_000);
    expect(retryAfterMs('invalid', now)).toBe(60_000);
  });

  it('enforces the anonymous daily budget across manual refreshes, failures and hydration', async () => {
    let now = 1000;
    let calls = 0;
    const storage = cache();
    const client = new MarketClient(
      async () => {
        calls++;
        return snapshot(now);
      },
      storage,
      () => now,
      600_000,
    );
    for (let attempt = 0; attempt < 10; attempt++) {
      await client.refresh();
      now += 61_000;
    }
    expect(calls).toBe(1);
    const hydrated = new MarketClient(
      async () => {
        calls++;
        return snapshot(now);
      },
      storage,
      () => 550_000,
      600_000,
    );
    await hydrated.refresh();
    expect(calls).toBe(1);
    let failures = 0;
    const offline = new MarketClient(
      async () => {
        failures++;
        throw new MarketRateLimit(60_000);
      },
      cache(),
      () => now,
      600_000,
    );
    await offline.refresh();
    now += 61_000;
    await offline.refresh();
    expect(failures).toBe(1);
    now += 600_000;
    await offline.refresh();
    expect(failures).toBe(2);
  });

  it('keeps the in-flight quote when the expanded panel replaces the preview', async () => {
    let calls = 0;
    let resolve!: (value: MarketSnapshot) => void;
    let signal!: AbortSignal;
    const client = new MarketClient(
      (given) => {
        calls += 1;
        signal = given;
        return new Promise((done) => {
          resolve = done;
        });
      },
      cache(),
      () => 1000,
      600_000,
    );
    const views = createMarketViewRegistry(client);
    const preview = views.connect(() => true);
    const unsubscribePreview = client.subscribe(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    unsubscribePreview();
    preview.disconnect();
    const unsubscribeExpanded = client.subscribe(() => {});
    const expanded = views.connect(() => true);
    await new Promise((done) => setImmediate(done));
    expect(signal.aborted).toBe(false);
    expect(calls).toBe(1);
    resolve(snapshot(1000));
    await client.refresh();
    expect(client.getSnapshot().snapshot?.assets).toHaveLength(1);
    expect(client.getSnapshot().error).toBeNull();
    expect(calls).toBe(1);
    await client.refresh();
    expect(calls).toBe(1);
    expanded.disconnect();
    unsubscribeExpanded();
  });

  it('wires both market screens through deferred panel ownership', () => {
    for (const file of ['apps/mobile/src/market.ts', 'mobile/src/market.ts']) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
      expect(source).toContain('createMarketViewRegistry');
      expect(source).toContain('connection.disconnect()');
      expect(source).not.toContain('activeViews');
    }
  });

  it('aborts a quote that leaves the foreground and does not retry inside the provider window', async () => {
    let calls = 0;
    let resolve!: (value: MarketSnapshot) => void;
    let signal!: AbortSignal;
    const client = new MarketClient(
      (given) => {
        calls += 1;
        signal = given;
        return new Promise((done) => {
          resolve = done;
        });
      },
      cache(),
      () => 1000,
      600_000,
    );
    let foreground = true;
    const views = createMarketViewRegistry(client);
    const panel = views.connect(() => foreground);
    const unsubscribe = client.subscribe(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    foreground = false;
    panel.sync();
    expect(signal.aborted).toBe(true);
    resolve(snapshot(1000));
    await client.refresh();
    expect(client.getSnapshot().snapshot).toBeNull();
    foreground = true;
    panel.sync();
    await client.refresh();
    expect(calls).toBe(1);
    unsubscribe();
    panel.disconnect();
    await new Promise((done) => setImmediate(done));
  });

  it('aborts network work on background and rejects late data', async () => {
    let resolve!: (value: MarketSnapshot) => void;
    let signal!: AbortSignal;
    const client = new MarketClient(
      (given) => {
        signal = given;
        return new Promise((r) => {
          resolve = r;
        });
      },
      cache(),
      () => 1000,
    );
    const pending = client.refresh();
    await Promise.resolve();
    await Promise.resolve();
    client.setActive(false);
    expect(signal.aborted).toBe(true);
    resolve(snapshot(1000));
    await pending;
    expect(client.getSnapshot().snapshot).toBeNull();
    expect(client.getSnapshot().loading).toBe(false);
  });

  it('locks local state before profile logout, even when network logout fails', async () => {
    const order: string[] = [];
    await expect(
      signOutAndLock(
        {
          lock: async () => {
            order.push('engine');
          },
        },
        {
          lockSnapshot: () => order.push('snapshot'),
          refresh: async () => {
            order.push('refresh');
          },
        },
        async () => {
          order.push('logout');
          return { error: new Error('offline') };
        },
      ),
    ).rejects.toThrow('wallet is locked');
    expect(order).toEqual(['snapshot', 'engine', 'refresh', 'logout']);
  });
});
