import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { fetchWatchAccounts, sumXrp, type WatchAccount } from '../watch';
import { assetTicker } from '../format';
import { JoeyMark } from '../components/icons';
import { copyText } from '../components/primitives';

/**
 * Read only balances for every wallet the signed in profile has saved, from any
 * browser or phone. Spending stays impossible here by construction: this screen
 * never opens the vault and no key material exists on a device that has not
 * been set up.
 */
export function ProfileBalances() {
  const [accounts, setAccounts] = useState<WatchAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: labelError } = await supabase
        .from('wallet_labels')
        .select('address, name, provider')
        .is('removed_at', null)
        .order('created_at', { ascending: true });
      if (labelError) throw new Error(labelError.message);
      const entries = (data ?? []).map((row) => ({ address: row.address, name: row.name }));
      const watched = await fetchWatchAccounts(entries);
      const providers = new Map((data ?? []).map((row) => [row.address, row.provider]));
      setAccounts(
        watched.map((account) => ({
          ...account,
          provider: providers.get(account.address) === 'joey' ? 'joey' : null,
        })),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your wallets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = accounts ? sumXrp(accounts) : '0';

  return (
    <div className="shell">
      <SiteHeader />
      <main className="legal-page stack">
        <header className="stack" style={{ gap: 6 }}>
          <h1>Watch only balances</h1>
          <p className="inline-note">
            This is the read only view of the wallets saved to your profile, live from Mainnet, on
            any device. Your full unified wallet, with sending, receiving and per wallet assets,
            lives under My wallet on the device that holds your keys.
          </p>
        </header>

        <div className="card">
          <span className="field-label">Total XRP across your wallets</span>
          <p style={{ fontSize: 30, fontWeight: 650, margin: '4px 0 0' }}>
            {loading ? '…' : total} <span style={{ fontSize: 16 }}>XRP</span>
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="button button--secondary" onClick={() => void load()}>
              Refresh
            </button>
            <Link to="/wallet" className="button button--accent">
              Open unified wallet
            </Link>
          </div>
        </div>

        {error ? <div className="callout callout--danger">{error}</div> : null}

        {!loading && accounts && accounts.length === 0 ? (
          <div className="callout callout--info">
            <strong>No wallets saved yet</strong>
            <p>
              Unlock your wallet once on the device that holds it. Ledgerly then saves the public
              addresses and names to your profile so they show up here. Keys and recovery phrases
              never leave that device.
            </p>
          </div>
        ) : null}

        {loading && !accounts ? <p className="empty">Reading the ledger…</p> : null}

        <div className="stack">
          {(accounts ?? []).map((account) => (
            <article
              key={account.address}
              className="card stack profile-wallet"
              style={{ gap: 10 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17 }}>
                    {account.name}{' '}
                    {account.provider === 'joey' ? (
                      <span className="wallet-badge" title="Joey wallet">
                        <JoeyMark aria-hidden="true" /> Joey
                      </span>
                    ) : null}
                  </h2>
                  <code className="mono">{account.address}</code>
                </div>
                <span className="pill">
                  {account.error
                    ? 'Unavailable'
                    : account.funded
                      ? 'Watch only'
                      : 'Needs activation'}
                </span>
              </div>

              {account.error ? (
                <p className="inline-note">{account.error}</p>
              ) : account.funded ? (
                <>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{account.xrp} XRP</p>
                  {account.tokens.length > 0 ? (
                    <ul className="stack" style={{ gap: 4, listStyle: 'none', padding: 0 }}>
                      {account.tokens.map((token) => (
                        <li
                          key={`${token.display}-${token.issuer}`}
                          style={{ display: 'flex', justifyContent: 'space-between' }}
                        >
                          <span>{assetTicker(token.display)}</span>
                          <span>{token.balance}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="inline-note">No other assets held.</p>
                  )}
                </>
              ) : (
                <div className="callout callout--info" style={{ margin: 0 }}>
                  <strong>This wallet is waiting to be activated</strong>
                  <p>
                    The address is valid, it just has not received its first payment yet. Send at
                    least 1 XRP to it from an exchange or another wallet. The XRP Ledger keeps that
                    1 XRP as the account reserve, and anything above it is spendable.
                  </p>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => void copyText(account.address)}
                  >
                    Copy address
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
