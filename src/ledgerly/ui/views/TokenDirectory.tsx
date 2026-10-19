import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { searchTokens, type DirectoryToken } from '@/lib/tokens.functions';
import { Button, Callout, Dialog, EmptyState, TextField } from '../components/primitives';
import { assetTicker, formatRelativeTime, tokenBadgeLabel } from '../format';

export interface TrustLinePrefill {
  currency: string;
  issuer: string;
  limit: string;
}

interface HeldLine {
  currency: string;
  issuer: string;
}

const DEFAULT_LIMIT = '1000000000';

function formatHolders(count: number): string {
  if (count >= 1000) return `${Math.round(count / 1000).toLocaleString()}k holders`;
  return `${count.toLocaleString()} holders`;
}

/**
 * Browse the cached Mainnet token directory and hand a filled-in trust line
 * back to the existing TrustSet review flow. Nothing here signs anything.
 */
export function TokenDirectory({
  held,
  onClose,
  onSelect,
}: {
  held: readonly HeldLine[];
  onClose: () => void;
  onSelect: (prefill: TrustLinePrefill) => void;
}) {
  const run = useServerFn(searchTokens);
  const [query, setQuery] = useState('');
  const [tokens, setTokens] = useState<DirectoryToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<DirectoryToken | null>(null);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      () => {
        setLoading(true);
        void run({ data: { query } })
          .then((result) => {
            if (cancelled) return;
            setTokens(result.tokens);
            setError(result.error);
          })
          .catch(() => {
            if (!cancelled) setError('Token directory is unavailable right now.');
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      query === '' ? 0 : 250,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, run]);

  const heldKeys = useMemo(
    () => new Set(held.map((line) => `${line.currency}:${line.issuer}`)),
    [held],
  );

  const updated = tokens[0]?.lastSyncedAt;

  if (chosen) {
    const isHeld = heldKeys.has(`${chosen.currency}:${chosen.issuer}`);
    const lookalike = tokens.find(
      (token) =>
        token.ticker.toUpperCase() === chosen.ticker.toUpperCase() &&
        token.issuer !== chosen.issuer &&
        token.holders > chosen.holders,
    );

    return (
      <Dialog eyebrow="Add token" title={assetTicker(chosen.ticker)} onClose={onClose}>
        <div className="token-detail">
          {chosen.logoUrl ? (
            <img className="token-logo" src={chosen.logoUrl} alt="" width={40} height={40} />
          ) : (
            <span className="row-badge is-token">
              {tokenBadgeLabel(chosen.ticker || chosen.displayName || '?')}
            </span>
          )}
          <div className="row-main">
            <strong>{chosen.displayName ?? chosen.ticker}</strong>
            <span>
              {chosen.issuerName ? `${chosen.issuerName} · ` : ''}
              {formatHolders(chosen.holders)}
            </span>
          </div>
        </div>

        <div className="token-issuer">
          <span className="field-label">Issuer address</span>
          <span className="mono">{chosen.issuer}</span>
        </div>

        {chosen.holders < 500 ? (
          <Callout tone="caution" title="Small holder base">
            Only a few accounts hold this token. Check the issuer address against a source you trust
            before you add it.
          </Callout>
        ) : null}

        {lookalike ? (
          <Callout tone="caution" title="Similar ticker">
            Another token uses the ticker {assetTicker(chosen.ticker)} with a different issuer and a
            much larger holder base. Compare the issuer address carefully.
          </Callout>
        ) : null}

        <Callout tone="info">
          Adding a token opens a trust line. It sets aside 0.2 XRP from your balance, and you get
          that back if you remove the line later. Listing here is not an endorsement.
        </Callout>

        {advanced ? (
          <TextField
            label="Limit"
            inputMode="decimal"
            autoComplete="off"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            hint="The most of this token your account will accept."
          />
        ) : (
          <button className="link-button" onClick={() => setAdvanced(true)}>
            Set a custom limit
          </button>
        )}

        {isHeld ? <Callout tone="info">You already hold this token.</Callout> : null}

        <div className="button-row">
          <Button variant="secondary" onClick={() => setChosen(null)}>
            Back
          </Button>
          <Button
            variant="accent"
            disabled={isHeld || limit.trim() === ''}
            onClick={() =>
              onSelect({ currency: chosen.currency, issuer: chosen.issuer, limit: limit.trim() })
            }
          >
            Continue
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog eyebrow="Mainnet" title="Add a token" onClose={onClose}>
      <TextField
        label="Search"
        placeholder="Name, ticker, or issuer"
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div className="token-list">
        {loading && tokens.length === 0 ? (
          <EmptyState>Loading tokens…</EmptyState>
        ) : tokens.length === 0 ? (
          <EmptyState>
            No tokens matched that search. You can still add one by entering the details yourself.
          </EmptyState>
        ) : (
          tokens.map((token) => {
            const isHeld = heldKeys.has(`${token.currency}:${token.issuer}`);
            return (
              <button
                className="row token-row"
                key={`${token.currency}-${token.issuer}`}
                onClick={() => {
                  setChosen(token);
                  setAdvanced(false);
                  setLimit(DEFAULT_LIMIT);
                }}
              >
                {token.logoUrl ? (
                  <img className="token-logo" src={token.logoUrl} alt="" width={32} height={32} />
                ) : (
                  <span className="row-badge is-token">
                    {tokenBadgeLabel(token.ticker || token.displayName || '?')}
                  </span>
                )}
                <div className="row-main">
                  <strong>{assetTicker(token.ticker)}</strong>
                  <span>
                    {token.issuerName ?? token.displayName ?? 'Unknown issuer'} ·{' '}
                    {formatHolders(token.holders)}
                  </span>
                </div>
                <div className="row-end">{isHeld ? <span>Added</span> : <span>Add</span>}</div>
              </button>
            );
          })
        )}
      </div>

      <div className="button-row token-directory-footer">
        <span className="inline-note">
          {updated ? `Updated ${formatRelativeTime(new Date(updated).getTime())}` : ''}
        </span>
        <button
          className="link-button"
          onClick={() => onSelect({ currency: '', issuer: '', limit: '' })}
        >
          Enter details manually
        </button>
      </div>
    </Dialog>
  );
}
