import { useEffect, useRef, useState, type ReactNode } from 'react';
import { addDrops, dropsToXrp, formatAmount, shortenAddress } from '@ledgerly/core/shared';
import type { Portfolio } from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { useAsyncAction, useAsyncData } from '../store';
import { Button, CopyButton, Dialog, DocLink, EmptyState, Panel } from '../components/primitives';
import {
  EyeIcon,
  EyeOffIcon,
  JoeyMark,
  PencilIcon,
  ReceiveIcon,
  RefreshIcon,
  SendIcon,
} from '../components/icons';
import { ActivityRow } from '../components/ActivityRow';
import { WalletCard } from '../components/WalletCard';

import { assetTicker, explorerAccountUrl, explorerTxUrl, tokenBadgeLabel } from '../format';
import { XRPL_DOCS } from '../docs';
import { RenameAccountDialog } from './AccountDialogs';
import { Send } from './Send';
import { Receive } from './Receive';
import { ActivateAccount } from './Activate';
import { recordWalletActivated } from '../metrics';
import { fundAndWait } from '../funding';

export function Dashboard({
  viewMode = 'single',
  onFocusAccount,
}: {
  viewMode?: 'single' | 'all';
  onFocusAccount?: () => void;
} = {}) {
  const { wallet, state, store, openExternal } = useWallet();
  const accountId = state.activeAccountId;

  const [dialog, setDialog] = useState<'send' | 'receive' | 'activate' | null>(null);

  const contacts = useAsyncData(() => wallet.listContacts(), []);

  const portfolio = useAsyncData(
    async () => (accountId ? wallet.getPortfolio({ accountId }) : null),
    [accountId, state.network.id],
  );

  const history = useAsyncData(
    async () => (accountId ? wallet.getHistory({ accountId }) : null),
    [accountId, state.network.id],
  );

  // The ledger confirming a funded account is what makes a wallet "activated",
  // so the count is taken from the balance we just read, not from a promise to
  // fund one later.
  const summary = portfolio.data?.summary;
  useEffect(() => {
    if (summary?.exists) recordWalletActivated(state.network.id, [summary.address]);
  }, [summary?.exists, summary?.address, state.network.id]);

  /**
   * An account goes live the moment funds land, so the wallet watches for that
   * itself. Nobody should have to press an "activate" button after the XRP has
   * already arrived. The watch stops as soon as the ledger reports the account.
   */
  const waitingForFunds = Boolean(accountId && portfolio.data && !portfolio.data.summary.exists);
  useEffect(() => {
    if (!waitingForFunds || !accountId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void wallet
        .getPortfolio({ accountId, refresh: true })
        .then((next) => {
          if (!cancelled && next.summary.exists) {
            portfolio.reload();
            history.reload();
          }
        })
        .catch(() => {
          /* transient network trouble; the next tick tries again */
        });
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForFunds, accountId, state.network.id]);

  /**
   * Faucets take a few seconds to fund and validate, so the poll waits for the
   * balance to actually change rather than reporting success the moment the
   * request is accepted.
   */
  const fund = useAsyncAction(async () => {
    if (!accountId) return;
    await fundAndWait(wallet, accountId);
    portfolio.reload();
    history.reload();
  });

  const account = state.accounts.find((candidate) => candidate.id === accountId);

  if (viewMode === 'all') {
    return <AllWallets onFocusAccount={onFocusAccount} />;
  }

  if (!account || !accountId) return <EmptyState>No account selected.</EmptyState>;

  const refreshAll = () => {
    void wallet.getPortfolio({ accountId, refresh: true }).then(() => portfolio.reload());
    history.reload();
  };

  return (
    <div className="stack">
      <BalanceCard
        portfolio={portfolio.data}
        loading={portfolio.loading}
        error={portfolio.error}
        networkLabel={state.network.label}
        isTest={state.network.isTest}
        label={account.label}
        badge={
          account.external ? (
            <>
              <JoeyMark aria-hidden="true" /> Joey
            </>
          ) : null
        }

        address={account.address}
        explorerUrl={explorerAccountUrl(state.network, account.address)}
        onExplorer={() => {
          const url = explorerAccountUrl(state.network, account.address);
          if (url) openExternal(url);
        }}
        hidden={state.preferences.hideBalances}
        onToggleHidden={() => {
          void wallet
            .setPreferences({ hideBalances: !state.preferences.hideBalances })
            .then(() => store.refresh());
        }}
        onSend={() => setDialog('send')}
        onReceive={() => setDialog('receive')}
        onRefresh={refreshAll}
      />

      {state.network.faucet ? (
        <section className="card card--plain faucet-card">
          <div className="faucet-card-main">
            <span className="eyebrow">{state.network.label} faucet</span>
            <h3 className="card-title">
              {portfolio.data && !portfolio.data.summary.exists
                ? 'Activate this account'
                : 'Top up your test balance'}
            </h3>
            <p className="card-note">
              {portfolio.data && !portfolio.data.summary.exists ? (
                <>
                  This address has no ledger entry yet. It needs at least{' '}
                  {formatAmount(dropsToXrp(portfolio.data.reserve.baseDrops))} XRP to go live.
                </>
              ) : (
                <>Practice funds with no real value. Request more whenever you need them.</>
              )}
            </p>
            <DocLink href={XRPL_DOCS.reserves}>
              &nbsp;Read about account reserves on XRPL.org
            </DocLink>
            {fund.error ? <span className="field-error">{fund.error}</span> : null}
          </div>
          <Button
            variant="secondary"
            loading={fund.pending}
            onClick={() => void fund.run().catch(() => undefined)}
          >
            {fund.pending ? 'Requesting test XRP…' : 'Get test XRP'}
          </Button>
        </section>
      ) : null}

      {!state.network.faucet && portfolio.data && !portfolio.data.summary.exists ? (
        <section className="card card--plain faucet-card">
          <div className="faucet-card-main">
            <span className="eyebrow">{state.network.label}</span>
            <h3 className="card-title">Activate this account</h3>
            <p className="card-note">
              This address is not active on&nbsp;{state.network.label}, so you cannot hold XRP or
              any XRPL tokens here yet. Send at least{' '}
              {formatAmount(dropsToXrp(portfolio.data.reserve.baseDrops))} XRP here from an exchange
              or another wallet and it will be ready for real use. That amount stays as the account
              reserve.
            </p>
            <DocLink href={XRPL_DOCS.reserves}>
              &nbsp;Read about account reserves on XRPL.org
            </DocLink>
          </div>
          <Button variant="accent" onClick={() => setDialog('activate')}>
            Activate this account
          </Button>
        </section>
      ) : null}

      <Panel
        eyebrow="Portfolio"
        title="Your assets"
        action={
          <button className="icon-button" onClick={refreshAll} aria-label="Refresh">
            <RefreshIcon />
          </button>
        }
      >
        <AssetList portfolio={portfolio.data} hidden={state.preferences.hideBalances} />
      </Panel>

      <Panel eyebrow="Latest" title="Recent activity">
        {history.loading && !history.data ? (
          <EmptyState>Loading activity…</EmptyState>
        ) : history.data && history.data.entries.length > 0 ? (
          history.data.entries.slice(0, 5).map((entry) => (
            <ActivityRow
              key={entry.hash}
              entry={entry}
              accounts={state.accounts}
              contacts={contacts.data ?? []}
              networkId={state.network.id}
              networkLabel={state.network.label}
              onOpen={() => {
                const url = explorerTxUrl(state.network, entry.hash);
                if (url) openExternal(url);
              }}
            />
          ))
        ) : (
          <EmptyState>Nothing here yet. Transactions will appear as they confirm.</EmptyState>
        )}
      </Panel>

      {dialog === 'send' ? (
        <Send
          accountId={accountId}
          portfolio={portfolio.data}
          onClose={() => setDialog(null)}
          onSent={() => {
            setDialog(null);
            refreshAll();
          }}
        />
      ) : null}

      {dialog === 'receive' ? (
        <Receive address={account.address} onClose={() => setDialog(null)} />
      ) : null}

      {dialog === 'activate' ? (
        <ActivateAccount
          address={account.address}
          minimumXrp={
            portfolio.data ? formatAmount(dropsToXrp(portfolio.data.reserve.baseDrops)) : '1'
          }
          networkLabel={state.network.label}
          explorerUrl={explorerAccountUrl(state.network, account.address)}
          onCheck={async () => {
            const next = await wallet.getPortfolio({ accountId, refresh: true });
            portfolio.reload();
            history.reload();
            if (next.summary.exists) setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function BalanceCard({
  portfolio,
  loading,
  error,
  label,
  networkLabel,
  isTest,
  hidden,
  address,
  explorerUrl,
  onExplorer,
  onToggleHidden,
  onSend,
  onReceive,
  onRefresh,
  badge,
}: {
  portfolio: Portfolio | null;
  loading: boolean;
  error: string | null;
  label: string;
  networkLabel: string;
  isTest: boolean;
  hidden: boolean;
  address: string;
  explorerUrl: string | null;
  onExplorer: () => void;
  onToggleHidden: () => void;
  badge?: ReactNode;
  onSend: () => void;
  onReceive: () => void;
  onRefresh: () => void;
}) {
  const mask = '••••••';
  const balance = portfolio ? formatAmount(dropsToXrp(portfolio.summary.balanceDrops)) : null;
  const spendable = portfolio ? formatAmount(dropsToXrp(portfolio.summary.spendableDrops)) : null;
  const reserve = portfolio ? formatAmount(dropsToXrp(portfolio.summary.reserveDrops)) : null;
  const active = Boolean(portfolio?.summary.exists);

  return (
    <WalletCard
      skin="feature"
      title={label}
      {...(badge ? { badge } : {})}
      address={hidden ? '•'.repeat(24) : address}
      headActions={
        <>
          <CopyButton value={address} label="Copy" />
          <button
            className="icon-button"
            onClick={onToggleHidden}
            aria-label={hidden ? 'Show balances' : 'Hide balances'}
          >
            {hidden ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </>
      }
      networkLabel={networkLabel}
      isTest={isTest}
      balance={hidden ? mask : (balance ?? (loading ? '—' : '0'))}
      state={
        portfolio
          ? active
            ? `${portfolio.tokens.filter((token) => !token.isObligation).length} tokens`
            : 'Not activated yet'
          : loading
            ? 'Loading…'
            : 'Could not load'
      }
      note={
        error ? (
          <>
            <span style={{ color: 'var(--danger)' }}>{error}</span>{' '}
            <button className="link-button" onClick={onRefresh}>
              Retry
            </button>
          </>
        ) : portfolio && !active ? (
          <>Not active on {networkLabel} yet. Fund this address to bring it online.</>
        ) : (
          <>
            Spendable {hidden ? mask : (spendable ?? '—')} XRP, reserved{' '}
            {hidden ? mask : (reserve ?? '—')} XRP.
          </>
        )
      }
      actions={
        <>
          <Button variant="accent" block onClick={onSend}>
            <SendIcon /> Send
          </Button>
          <Button variant="secondary" block onClick={onReceive}>
            <ReceiveIcon /> Receive
          </Button>
        </>
      }
      links={
        explorerUrl ? (
          <button type="button" className="link-button" onClick={() => onExplorer()}>
            View on {networkLabel} explorer
          </button>
        ) : null
      }
    />
  );
}

function AssetList({ portfolio, hidden }: { portfolio: Portfolio | null; hidden: boolean }) {
  if (!portfolio) return <EmptyState>Loading balances…</EmptyState>;
  if (!portfolio.summary.exists) {
    return (
      <EmptyState>
        This address holds nothing on this network yet. Activate it with a small amount of XRP and
        your assets will appear here.
      </EmptyState>
    );
  }

  // Xaman shows what you can actually spend as the headline number and keeps
  // the reserve as a quiet second line, because the reserve is not money you
  // can move. The same order is used here.
  const spendable = formatAmount(dropsToXrp(portfolio.summary.spendableDrops));
  const reserved = formatAmount(dropsToXrp(portfolio.summary.reserveDrops));
  const total = formatAmount(dropsToXrp(portfolio.summary.balanceDrops));

  return (
    <>
      <div className="row">
        <span className="row-badge is-xrp">XRP</span>
        <div className="row-main">
          <strong>{assetTicker('XRP')}</strong>
          <span>{hidden ? 'Reserved' : `${reserved} XRP reserved`}</span>
        </div>
        <div className="row-end">
          <strong>{hidden ? '••••' : spendable}</strong>
          <span>{hidden ? '' : `available of ${total} XRP`}</span>
        </div>
      </div>

      {portfolio.tokens
        .filter((token) => !token.isObligation)
        .map((token) => (
          <div className="row" key={`${token.currency}-${token.issuer}`}>
            <span className="row-badge is-token">{tokenBadgeLabel(token.display)}</span>
            <div className="row-main">
              <strong>{assetTicker(token.display)}</strong>
              <span>{shortenAddress(token.issuer)}</span>
            </div>
            <div className="row-end">
              <strong>{hidden ? '••••' : formatAmount(token.balance, 8)}</strong>
              {token.frozen ? <span style={{ color: 'var(--danger)' }}>Frozen</span> : null}
            </div>
          </div>
        ))}
    </>
  );
}

/**
 * Combined view across every wallet. It never merges tokens from different
 * issuers into one line: two issuers can use the same three letter code, and a
 * shared row would hide that.
 */
function AllWallets({ onFocusAccount }: { onFocusAccount?: () => void }) {
  const { wallet, state, store, openExternal } = useWallet();
  const hidden = state.preferences.hideBalances;
  const mask = '••••••';
  const [picker, setPicker] = useState<'receive' | null>(null);
  const [dialog, setDialog] = useState<{
    kind: 'send' | 'receive' | 'activate';
    accountId: string;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [funding, setFunding] = useState<string | null>(null);
  const [fundingError, setFundingError] = useState<{
    accountId: string;
    networkId: string;
    message: string;
  } | null>(null);
  const fundingBusy = useRef(false);

  const accountIds = state.accounts.map((account) => account.id).join(',');

  const portfolios = useAsyncData(async () => {
    const results = await Promise.allSettled(
      state.accounts.map((account) => wallet.getPortfolio({ accountId: account.id })),
    );
    return results.map((result, index) => ({
      account: state.accounts[index]!,
      portfolio: result.status === 'fulfilled' ? result.value : null,
    }));
  }, [accountIds, state.network.id]);

  const rows = portfolios.data ?? [];

  // Same rule in the combined view: every wallet the ledger reports as funded
  // counts once, whether or not the person is signed in.
  const activeAddresses = rows
    .filter((row) => row.portfolio?.summary.exists)
    .map((row) => row.portfolio!.summary.address)
    .join(',');
  useEffect(() => {
    if (activeAddresses) recordWalletActivated(state.network.id, activeAddresses.split(','));
  }, [activeAddresses, state.network.id]);

  const totalDrops = rows.reduce(
    (sum, row) => (row.portfolio ? addDrops(sum, row.portfolio.summary.balanceDrops) : sum),
    '0',
  );
  const spendableDrops = rows.reduce(
    (sum, row) => (row.portfolio ? addDrops(sum, row.portfolio.summary.spendableDrops) : sum),
    '0',
  );

  const inactive = rows.filter((row) => row.portfolio && !row.portfolio.summary.exists);

  /**
   * Watch any wallet still waiting on its first funds so it flips to active on
   * its own the moment the payment lands, with no button press and no manual
   * refresh. The watch stops once every wallet is live.
   */
  const waitingIds = inactive.map((row) => row.account.id).join(',');
  useEffect(() => {
    if (!waitingIds) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void Promise.allSettled(
        waitingIds.split(',').map((accountId) => wallet.getPortfolio({ accountId, refresh: true })),
      ).then((results) => {
        const landed = results.some(
          (result) => result.status === 'fulfilled' && result.value.summary.exists,
        );
        if (!cancelled && landed) portfolios.reload();
      });
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingIds, state.network.id]);

  const dialogAccount = state.accounts.find((account) => account.id === dialog?.accountId) ?? null;
  const dialogPortfolio =
    rows.find((row) => row.account.id === dialog?.accountId)?.portfolio ?? null;

  // Once the funds arrive there is nothing left to activate, so the guidance
  // dialog closes itself.
  const activateDone = dialog?.kind === 'activate' && Boolean(dialogPortfolio?.summary.exists);
  useEffect(() => {
    if (activateDone) setDialog(null);
  }, [activateDone]);

  /** Faucet funding for a single wallet on a test network, polled until it lands. */
  const fundAccount = async (accountId: string) => {
    if (fundingBusy.current) return;
    fundingBusy.current = true;
    setFunding(accountId);
    setFundingError(null);
    try {
      await fundAndWait(wallet, accountId);
    } catch (error) {
      setFundingError({
        accountId,
        networkId: state.network.id,
        message: error instanceof Error ? error.message : 'Could not request test XRP.',
      });
    } finally {
      portfolios.reload();
      fundingBusy.current = false;
      setFunding(null);
    }
  };

  return (
    <div className="stack">
      {/* Activation is a real money concern, so this banner is Mainnet only.
          Test networks hand out free XRP from a faucet and each wallet card
          already carries its own "Get test XRP" button. */}
      {!state.network.isTest && inactive.length > 0 ? (
        <section className="card card--plain activate-banner">
          <div className="faucet-card-main">
            <span className="eyebrow">Action needed</span>
            <h3 className="card-title">
              {inactive.length === 1
                ? '1 wallet is not active yet'
                : `${inactive.length} wallets are not active yet`}
            </h3>
            <p className="card-note">
              A wallet has to hold a small starting amount of XRP before it can receive anything on{' '}
              {state.network.label}. Add funds to each one below and it goes live right away.
            </p>
            <DocLink href={XRPL_DOCS.reserves}>
              &nbsp;Read about account reserves on XRPL.org
            </DocLink>
          </div>
          <div className="activate-banner-list">
            {inactive.map(({ account }) => (
              <div className="row activate-banner-row" key={account.id}>
                <div className="row-main">
                  <strong>{account.label}</strong>
                  <span className="mono">{shortenAddress(account.address, 8, 6)}</span>
                </div>
                <Button
                  variant="accent"
                  onClick={() => setDialog({ kind: 'activate', accountId: account.id })}
                >
                  Activate wallet
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <WalletCard
        variant="total"
        skin="feature"
        title="All wallets"
        subtitle={
          <>
            Combined total of your {state.accounts.length}{' '}
            {state.accounts.length === 1 ? 'wallet' : 'wallets'}. This view has no address of its
            own, each wallet keeps its own below.
          </>
        }
        networkLabel={state.network.label}
        isTest={state.network.isTest}
        balance={hidden ? mask : formatAmount(dropsToXrp(totalDrops))}
        state={`${state.accounts.length} ${state.accounts.length === 1 ? 'wallet' : 'wallets'}`}
        note={
          <>
            {hidden ? mask : formatAmount(dropsToXrp(spendableDrops))} XRP spendable after account
            reserves. Each network keeps its own funds and its own faucet.
          </>
        }
        actions={
          <>
            <Button
              variant="accent"
              block
              onClick={() =>
                setDialog({
                  kind: 'send',
                  accountId: state.activeAccountId ?? state.accounts[0]?.id ?? '',
                })
              }
            >
              <SendIcon /> Send
            </Button>
            <Button variant="secondary" block onClick={() => setPicker('receive')}>
              <ReceiveIcon /> Receive
            </Button>
          </>
        }
      />

      <div className="wallet-cards-head">
        <div>
          <span className="eyebrow">Wallets</span>
          <h3 className="card-title">Each wallet on its own</h3>
        </div>
        <button className="icon-button" onClick={() => portfolios.reload()} aria-label="Refresh">
          <RefreshIcon />
        </button>
      </div>

      {portfolios.loading && rows.length === 0 ? (
        <Panel eyebrow="Wallets" title="Balance by wallet">
          <EmptyState>Loading wallets…</EmptyState>
        </Panel>
      ) : (
        <div className="wallet-cards">
          {rows.map(({ account, portfolio }) => {
            const explorerUrl = explorerAccountUrl(state.network, account.address);
            const active = Boolean(portfolio?.summary.exists);
            return (
              <WalletCard
                key={account.id}
                title={account.label}
                {...(account.external
                  ? {
                      badge: (
                        <>
                          <JoeyMark aria-hidden="true" /> Joey
                        </>
                      ),
                    }
                  : {})}
                address={hidden ? '•'.repeat(24) : account.address}
                headActions={
                  <>
                    <CopyButton value={account.address} label="Copy" />
                    <button
                      className="icon-button"
                      aria-label={hidden ? 'Show balances' : 'Hide balances'}
                      title={hidden ? 'Show balances' : 'Hide balances'}
                      onClick={() => {
                        void wallet
                          .setPreferences({ hideBalances: !hidden })
                          .then(() => store.refresh());
                      }}
                    >
                      {hidden ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Change name for ${account.label}`}
                      title="Change account name"
                      onClick={() => setRenaming(account.id)}
                    >
                      <PencilIcon />
                    </button>
                  </>
                }
                networkLabel={state.network.label}
                isTest={state.network.isTest}
                balance={
                  portfolio
                    ? hidden
                      ? mask
                      : formatAmount(dropsToXrp(portfolio.summary.balanceDrops))
                    : '—'
                }
                state={
                  portfolio
                    ? active
                      ? `${portfolio.tokens.filter((token) => !token.isObligation).length} tokens`
                      : 'Not activated yet'
                    : 'Could not load'
                }
                note={
                  portfolio && active ? (
                    <>
                      Spendable{' '}
                      {hidden ? mask : formatAmount(dropsToXrp(portfolio.summary.spendableDrops))}{' '}
                      XRP, reserved{' '}
                      {hidden ? mask : formatAmount(dropsToXrp(portfolio.summary.reserveDrops))}{' '}
                      XRP.
                    </>
                  ) : portfolio ? (
                    <>
                      Not active on {state.network.label} yet. Fund this address to bring it online.
                    </>
                  ) : null
                }
                actions={
                  active ? (
                    <>
                      <Button
                        variant="accent"
                        block
                        onClick={() => setDialog({ kind: 'send', accountId: account.id })}
                      >
                        <SendIcon /> Send
                      </Button>
                      <Button
                        variant="secondary"
                        block
                        onClick={() => setDialog({ kind: 'receive', accountId: account.id })}
                      >
                        <ReceiveIcon /> Receive
                      </Button>
                    </>
                  ) : (
                    <>
                      {state.network.faucet ? (
                        <Button
                          variant="accent"
                          block
                          loading={funding === account.id}
                          disabled={funding !== null}
                          onClick={() => void fundAccount(account.id)}
                        >
                          {funding === account.id ? 'Requesting test XRP…' : 'Get test XRP'}
                        </Button>
                      ) : (
                        <Button
                          variant="accent"
                          block
                          onClick={() => setDialog({ kind: 'activate', accountId: account.id })}
                        >
                          Activate wallet
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        block
                        onClick={() => setDialog({ kind: 'receive', accountId: account.id })}
                      >
                        <ReceiveIcon /> Receive
                      </Button>
                    </>
                  )
                }
                links={
                  <>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        void wallet
                          .selectAccount({ accountId: account.id })
                          .then(() => store.refresh());
                        onFocusAccount?.();
                      }}
                    >
                      Open {account.label}
                    </button>
                    {explorerUrl ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => openExternal(explorerUrl)}
                      >
                        View on {state.network.label} explorer
                      </button>
                    ) : null}
                  </>
                }
              >
                {fundingError?.accountId === account.id &&
                fundingError.networkId === state.network.id ? (
                  <p className="field-error" role="alert">
                    {fundingError.message}
                  </p>
                ) : null}
                <AssetList portfolio={portfolio} hidden={hidden} />
              </WalletCard>
            );
          })}
        </div>
      )}

      {renaming ? (
        <RenameAccountDialog
          accountId={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => void store.refresh()}
        />
      ) : null}

      {picker ? (
        <Dialog eyebrow="Receive" title="Which wallet?" onClose={() => setPicker(null)}>
          <p className="inline-note">Choose the wallet you want to be paid into.</p>
          {state.accounts.map((account) => (
            <button
              key={account.id}
              className="row unified-row-button"
              onClick={() => {
                setDialog({ kind: picker, accountId: account.id });
                setPicker(null);
              }}
            >
              <span className="row-badge is-xrp">XRP</span>
              <span className="row-main">
                <strong>{account.label}</strong>
                <span className="mono">{shortenAddress(account.address, 8, 6)}</span>
              </span>
            </button>
          ))}
        </Dialog>
      ) : null}

      {dialog?.kind === 'send' && dialogAccount ? (
        <Send
          accountId={dialogAccount.id}
          portfolio={dialogPortfolio}
          onClose={() => setDialog(null)}
          onSent={() => {
            setDialog(null);
            portfolios.reload();
          }}
        />
      ) : null}

      {dialog?.kind === 'receive' && dialogAccount ? (
        <Receive address={dialogAccount.address} onClose={() => setDialog(null)} />
      ) : null}

      {dialog?.kind === 'activate' && dialogAccount ? (
        <ActivateAccount
          address={dialogAccount.address}
          minimumXrp={
            dialogPortfolio ? formatAmount(dropsToXrp(dialogPortfolio.reserve.baseDrops)) : '1'
          }
          networkLabel={state.network.label}
          explorerUrl={explorerAccountUrl(state.network, dialogAccount.address)}
          onCheck={async () => {
            const next = await wallet.getPortfolio({
              accountId: dialogAccount.id,
              refresh: true,
            });
            portfolios.reload();
            if (next.summary.exists) setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
