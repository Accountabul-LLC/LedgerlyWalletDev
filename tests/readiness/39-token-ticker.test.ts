import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokenTicker } from '../../src/ledgerly/ui/components/TokenTicker';
import { marketIdentity, MARKET_XRP_URL } from '../../src/ledgerly/native/market-data';
import {
  TICKER_LIST_URL,
  createTickerLoader,
  normalizeTickerQuotes,
  formatTickerPrice,
  formatTickerChange,
  TICKER_MAX_AGE_MS,
} from '../../src/lib/token-ticker';

const time = Date.now();
const issuer = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const row = {
  md5: marketIdentity('USD', issuer),
  issuer,
  currency: 'USD',
  name: 'USD',
  user: 'Synthetic issuer',
  usd: '1.33',
  pro24h: 20,
  p24h: 999,
  time,
};
const native = {
  md5: marketIdentity('XRP', null),
  issuer: 'XRPL',
  currency: 'XRP',
  name: 'XRP',
  user: 'XRP',
  usd: '1.33',
  pro24h: -10,
  time,
};
const list = (tokens: unknown[] = [row]) => ({ success: true, tokens });
const xrp = { success: true, token: native };
const signal = () => new AbortController().signal;

describe('XRPL token ticker', () => {
  it('retains exactly 50 ranked identities including XRP, with missing/stale quotes shown as unavailable', () => {
    const rows = Array.from({ length: 50 }, (_, i) => {
      const currency = `A${String(i).padStart(2, '0')}`;
      return { ...row, currency, name: currency, md5: marketIdentity(currency, issuer) };
    });
    rows[40] = { ...rows[40], time: time - TICKER_MAX_AGE_MS - 1 };
    const snapshot = normalizeTickerQuotes(list(rows), xrp, time);
    expect(snapshot.quotes).toHaveLength(50);
    expect(snapshot.quotes[0].symbol).toBe('XRP');
    expect(snapshot.quotes[49].symbol).toBe('A48');
    expect(snapshot.quotes[41].priceUsd).toBeNull();
    expect(snapshot.quotes[41].change24h).toBeNull();
    expect(new URL(TICKER_LIST_URL).searchParams.get('limit')).toBe('50');
  });
  it('keeps small prices visible and distinguishes gains, losses and missing changes', () => {
    expect(formatTickerPrice(1.33)).toBe('$1.33');
    expect(formatTickerPrice(0.00000866)).toBe('$0.00000866');
    expect(formatTickerPrice(1e-10)).toBe('<$0.00000001');
    expect(formatTickerPrice(0)).toBe('$0.00');
    expect(formatTickerChange(3.14)).toBe('+3.14%');
    expect(formatTickerChange(-2.5)).toBe('−2.50%');
    expect(formatTickerChange(0)).toBe('0.00%');
    expect(formatTickerChange(null)).toBe('—');
  });

  it('combines token/XRP and XRP/USD returns rather than showing XRP changes beside USD prices', () => {
    const snapshot = normalizeTickerQuotes(list(), xrp, time);
    expect(snapshot.source).toBe('xrpl.to');
    expect(snapshot.quotes[0].symbol).toBe('XRP');
    expect(snapshot.quotes[0].change24h).toBe(-10);
    expect(snapshot.quotes[1].change24h).toBeCloseTo(8);
    const stable = normalizeTickerQuotes(
      list([{ ...row, pro24h: (1 / 0.9 - 1) * 100 }]),
      xrp,
      time,
    );
    expect(stable.quotes[1].change24h).toBeCloseTo(0);
  });

  it('validates issuer/currency identity, deduplicates and rejects stale or malformed prices', () => {
    const result = normalizeTickerQuotes(
      list([
        row,
        row,
        { ...row, md5: '0'.repeat(32) },
        { ...row, usd: 'Infinity' },
        { ...row, time: time - TICKER_MAX_AGE_MS - 1 },
      ]),
      xrp,
      time,
    );
    expect(result.quotes).toHaveLength(2);
    expect(result.quotes[1].id).toBe(row.md5);
    expect(() => normalizeTickerQuotes({ success: false }, xrp, time)).toThrow();
    expect(() => normalizeTickerQuotes(list([]), { success: false }, time)).toThrow();
  });

  it('never invents USD change when the XRP baseline or token change is missing', () => {
    expect(normalizeTickerQuotes(list(), { success: false }, time).quotes[0].change24h).toBeNull();
    expect(
      normalizeTickerQuotes(list([{ ...row, pro24h: null }]), xrp, time).quotes[1].change24h,
    ).toBeNull();
    expect(
      normalizeTickerQuotes(
        list(),
        { success: true, token: { ...native, time: time - TICKER_MAX_AGE_MS - 1 } },
        time,
      ).quotes[0].change24h,
    ).toBeNull();
  });

  it('renders XRPL attribution, identity links, signed changes and an accessible pause control', () => {
    const client = new QueryClient();
    client.setQueryData(
      ['public', 'xrpl-token-ticker', 50],
      normalizeTickerQuotes(list(), xrp, time),
    );
    const markup = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(TokenTicker)),
    );
    expect(markup).toContain('Data by xrpl.to');
    expect(markup).toContain(`https://xrpl.to/token/${row.md5}`);
    expect(markup).toContain('+8.00%');
    expect(markup).toContain('Pause token ticker');
    expect(markup.match(/class="token-ticker__icon/g)).toHaveLength(4);
    expect(markup).toContain('token-ticker__icon--xrp');
    expect(markup.match(/<img /g)).toHaveLength(2);
    expect(markup).toContain('>US</span>');
    expect(markup).toContain('aria-hidden="true" inert=""');
    expect(markup).not.toMatch(/coingecko/i);
    client.clear();
  });

  it('shows an unavailable state without invented prices', () => {
    const client = new QueryClient();
    client.setQueryData(['public', 'xrpl-token-ticker', 50], null);
    const markup = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(TokenTicker)),
    );
    expect(markup).toContain('Token prices temporarily unavailable');
    expect(markup).not.toContain('$0.00');
    client.clear();
  });

  it('renders a resolved project logo in both tracks with anonymous image requests', () => {
    const client = new QueryClient();
    client.setQueryData(
      ['public', 'xrpl-token-ticker', 50],
      normalizeTickerQuotes(list(), xrp, time),
    );
    const icon = 'https://s2.xrplmeta.org/icon/DD77BF0948.png';
    client.setQueryData(['public', 'xrpl-token-logo', row.md5], icon);
    const markup = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(TokenTicker)),
    );
    expect(markup.match(/class="token-ticker__logo"/g)).toHaveLength(2);
    expect(markup.match(/crossorigin="anonymous"/g)).toHaveLength(2);
    expect(markup).toContain(`src="${icon}"`);
    expect(markup).toContain('Logos: XRPL Meta');
    client.clear();
  });
});

describe('anonymous XRPL browser feed', () => {
  it('only requests the documented XRPL feeds without credentials, API keys, referrers or a server proxy', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        Response.json(String(url) === MARKET_XRP_URL ? xrp : list()),
      );
    const result = await createTickerLoader(fetcher, () => time)(signal());
    expect(result.quotes).toHaveLength(2);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([TICKER_LIST_URL, MARKET_XRP_URL]);
    for (const [, options] of fetcher.mock.calls) {
      expect(options).toMatchObject({
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        redirect: 'error',
      });
      expect(options?.headers).toEqual({ Accept: 'application/json' });
    }
  });

  it('honors Retry-After before making another request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Limited', { status: 429, headers: { 'Retry-After': '600' } }),
      )
      .mockResolvedValueOnce(Response.json(xrp));
    const load = createTickerLoader(fetcher, () => time);
    await expect(load(signal())).rejects.toMatchObject({ retryMs: 600_000 });
    await expect(load(signal())).rejects.toMatchObject({ retryMs: 600_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects non-JSON and oversized responses', async () => {
    for (const response of [
      new Response('<html>unavailable</html>', { headers: { 'Content-Type': 'text/html' } }),
      new Response(' '.repeat(1_048_577), { headers: { 'Content-Type': 'application/json' } }),
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(Response.json(xrp));
      await expect(createTickerLoader(fetcher, () => time)(signal())).rejects.toThrow();
    }
  });
});
