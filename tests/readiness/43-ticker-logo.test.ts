import { describe, expect, it, vi } from 'vitest';
import {
  createTickerLogoLoader,
  tickerLogoPath,
  normalizeTickerLogo,
} from '../../src/lib/ticker-logo';
import { marketIdentity } from '../../src/ledgerly/native/market-data';

const issuer = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const token = { currency: 'USD', issuer, id: marketIdentity('USD', issuer)! };
const icon = 'https://s2.xrplmeta.org/icon/DD77BF0948.png';
const metadata = { currency: token.currency, issuer, meta: { token: { icon } } };
describe('ticker logo delivery', () => {
  it('only addresses public metadata with a canonical currency/issuer identity', async () => {
    expect(tickerLogoPath(token)).toBe(`https://s1.xrplmeta.org/v2/token/USD:${issuer}`);
    const fetcher = vi.fn(async () => new Response());
    const load = createTickerLogoLoader(fetcher);
    for (const invalid of ['../../private', 'https://example.com', token.id.toUpperCase(), ''])
      await expect(load({ ...token, id: invalid })).rejects.toThrow('Invalid token identity');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('queues metadata reads and releases slots after a failed request', async () => {
    let active = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const fetcher = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      const number = fetcher.mock.calls.length;
      await new Promise<void>((resolve) => release.push(resolve));
      active--;
      return number === 1 ? new Response('Unavailable', { status: 503 }) : Response.json(metadata);
    });
    const load = createTickerLogoLoader(fetcher);
    const pending = Promise.allSettled(Array.from({ length: 8 }, () => load(token)));
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 8; i++) {
      release.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const results = await pending;
    expect(peak).toBe(3);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(7);
    expect(fetcher.mock.calls[0]).toEqual([
      tickerLogoPath(token),
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    ]);
  });
  it('rejects unavailable, redirected and non-JSON responses', async () => {
    for (const response of [
      new Response('No key', { status: 503 }),
      new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
      new Response('<html/>', { headers: { 'content-type': 'text/html' } }),
    ])
      await expect(createTickerLogoLoader(vi.fn(async () => response))(token)).rejects.toThrow();
    const redirected = Response.json(metadata);
    Object.defineProperty(redirected, 'redirected', { value: true });
    await expect(createTickerLogoLoader(vi.fn(async () => redirected))(token)).rejects.toThrow();
  });
  it('uses only a matching token logo on the documented image hosts', () => {
    expect(normalizeTickerLogo(metadata, token)).toBe(icon);
    expect(() => normalizeTickerLogo({ ...metadata, issuer: 'another-issuer' }, token)).toThrow();
    expect(() => normalizeTickerLogo({ ...metadata, currency: 'EUR' }, token)).toThrow();
    for (const bad of [
      'javascript:alert(1)',
      'https://attacker.test/icon/a.png',
      'https://s2.xrplmeta.org.attacker.test/icon/a.png',
      'https://s2.xrplmeta.org/icon/a.svg',
      'https://s2.xrplmeta.org/icon/a.png?key=secret',
      null,
    ])
      expect(() =>
        normalizeTickerLogo({ ...metadata, meta: { token: { icon: bad } } }, token),
      ).toThrow();
  });
});
