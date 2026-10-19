import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play } from 'lucide-react';
import {
  formatTickerChange,
  formatTickerPrice,
  loadTickerQuotes,
  TICKER_MAX_AGE_MS,
  TICKER_REFRESH_MS,
  TICKER_LIMIT,
  type TickerQuote,
} from '@/lib/token-ticker';
import { MarketRateLimit } from '@/ledgerly/native/market-client';
import xrpSymbol from '@/assets/tokens/xrp-symbol.svg';
import { loadTickerLogo } from '@/lib/ticker-logo';
import './token-ticker.css';

function TokenIcon({ quote }: { quote: TickerQuote }) {
  const native = quote.id === '84e5efeb89c4eae8f68188982dc290d8';
  const { data: logo } = useQuery({
    queryKey: ['public', 'xrpl-token-logo', quote.id],
    queryFn: () => loadTickerLogo(quote),
    enabled: !native,
    staleTime: 86_400_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hue = Number.parseInt(quote.id.slice(0, 6), 16) % 360;
  const initials =
    Array.from(quote.symbol.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase())
      .slice(0, 2)
      .join('') || '●';
  return (
    <span
      className={`token-ticker__icon${native ? ' token-ticker__icon--xrp' : ''}`}
      aria-hidden="true"
      style={
        native
          ? undefined
          : { backgroundColor: `hsl(${hue} 65% 92%)`, color: `hsl(${hue} 55% 28%)` }
      }
    >
      {native ? (
        <img src={xrpSymbol} alt="" width={24} height={21} />
      ) : logo && failedUrl !== logo ? (
        <img
          className="token-ticker__logo"
          src={logo}
          alt=""
          width={36}
          height={36}
          decoding="async"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(logo)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

function Quote({ quote }: { quote: TickerQuote }) {
  const direction =
    quote.change24h === null || quote.change24h === 0
      ? 'flat'
      : quote.change24h > 0
        ? 'up'
        : 'down';
  return (
    <li className="token-ticker__quote">
      <a
        href={`https://xrpl.to/token/${quote.id}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`${quote.name} · xrpl.to market quote`}
      >
        <TokenIcon quote={quote} />
        <span className="token-ticker__symbol">{quote.symbol.toUpperCase()}</span>
        <span aria-label={quote.priceUsd === null ? 'Price unavailable' : undefined}>
          {quote.priceUsd === null ? '—' : formatTickerPrice(quote.priceUsd)}
        </span>
        <span
          className={`token-ticker__change token-ticker__change--${direction}`}
          aria-label={
            quote.change24h === null
              ? '24-hour change unavailable'
              : `24-hour change ${formatTickerChange(quote.change24h)}`
          }
        >
          {formatTickerChange(quote.change24h)}
        </span>
      </a>
    </li>
  );
}

export function TokenTicker() {
  const [paused, setPaused] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const windowRef = useRef<HTMLDivElement>(null);
  const { data, isPending, isError } = useQuery({
    queryKey: ['public', 'xrpl-token-ticker', TICKER_LIMIT],
    queryFn: ({ signal }) => loadTickerQuotes(signal),
    staleTime: TICKER_REFRESH_MS,
    refetchInterval: (query) =>
      query.state.error instanceof MarketRateLimit
        ? Math.max(TICKER_REFRESH_MS, query.state.error.retryMs)
        : TICKER_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const quotes =
    data?.quotes.map((quote) =>
      quote.updatedAt !== null && clock - Date.parse(quote.updatedAt) <= TICKER_MAX_AGE_MS
        ? quote
        : { ...quote, priceUsd: null, change24h: null },
    ) ?? [];
  const ready = Boolean(quotes.length > 0 && data && clock - data.fetchedAt <= TICKER_MAX_AGE_MS);
  useEffect(() => {
    if (ready && windowRef.current) windowRef.current.scrollLeft = 0;
  }, [ready]);

  return (
    <section
      className={`token-ticker${paused ? ' token-ticker--paused' : ''}`}
      aria-label="XRP Ledger market prices"
    >
      <div className="token-ticker__label">
        <strong>XRPL top 50</strong>
        <span>{ready && isError ? 'Last available · 24h' : 'USD · 24h'}</span>
      </div>
      {ready ? (
        <div
          className="token-ticker__window"
          ref={windowRef}
          aria-label="Automatically scrolling top 50 XRP Ledger token prices"
        >
          <div
            className="token-ticker__track"
            style={{ animationDuration: `${Math.max(60, quotes.length * 6)}s` }}
          >
            <ul className="token-ticker__list">
              {quotes.map((quote) => (
                <Quote key={quote.id} quote={quote} />
              ))}
            </ul>
            <ul className="token-ticker__list token-ticker__copy" aria-hidden="true" inert>
              {quotes.map((quote) => (
                <Quote key={quote.id} quote={quote} />
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="token-ticker__message" role="status">
          {isPending ? 'Loading token prices…' : 'Token prices temporarily unavailable'}
        </p>
      )}
      <div className="token-ticker__controls">
        <div className="token-ticker__credits">
          <a href="https://xrpl.to" target="_blank" rel="noopener noreferrer">
            Data by xrpl.to
          </a>
          <a href="https://xrplmeta.org" target="_blank" rel="noopener noreferrer">
            Logos: XRPL Meta
          </a>
        </div>
        {ready ? (
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? 'Resume token ticker' : 'Pause token ticker'}
            aria-pressed={paused}
          >
            {paused ? (
              <Play size={14} aria-hidden="true" />
            ) : (
              <Pause size={14} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    </section>
  );
}
