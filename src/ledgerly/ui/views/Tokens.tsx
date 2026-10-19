import { useState } from 'react';
import {
  dropsToXrp,
  formatAmount,
  shortenAddress,
  type PreparedTransaction,
} from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { joeyProvider } from '../external/joey';
import { useAsyncAction, useAsyncData } from '../store';
import {
  Button,
  Callout,
  DocLink,
  DetailList,
  Dialog,
  EmptyState,
  Panel,
  RiskFindings,
  TextField,
} from '../components/primitives';
import { PlusIcon, TrashIcon } from '../components/icons';
import { assetTicker, tokenBadgeLabel } from '../format';
import { TokenDirectory } from './TokenDirectory';
import { XRPL_DOCS } from '../docs';

export function Tokens() {
  const { wallet, state } = useWallet();
  const accountId = state.activeAccountId;
  const [dialog, setDialog] = useState<{ currency: string; issuer: string; limit: string } | null>(
    null,
  );
  const [directory, setDirectory] = useState(false);

  const portfolio = useAsyncData(
    async () => (accountId ? wallet.getPortfolio({ accountId }) : null),
    [accountId, state.network.id],
  );

  if (!accountId) return <EmptyState>No account selected.</EmptyState>;

  const summary = portfolio.data?.summary;
  const activated = summary?.exists === true;
  const tokens = activated ? (portfolio.data?.tokens ?? []) : [];
  const canBrowse = state.network.id === 'mainnet';

  return (
    <div className="stack">
      <Panel
        eyebrow="Your holdings"
        title="Assets"
        action={
          activated ? (
            <button
              className="icon-button"
              aria-label="Add a token"
              title="Add a token"
              onClick={() =>
                canBrowse ? setDirectory(true) : setDialog({ currency: '', issuer: '', limit: '' })
              }
            >
              <PlusIcon />
            </button>
          ) : null
        }
      >
        {portfolio.loading && !portfolio.data ? (
          <EmptyState>Loading assets…</EmptyState>
        ) : !activated ? (
          <EmptyState>
            This address is not active on {state.network.label} yet, so it holds no assets here.
            Activate it with a small amount of XRP and your balances will show up.
          </EmptyState>
        ) : (
          <>
            <div className="row">
              <span className="row-badge is-xrp">XRP</span>
              <div className="row-main">
                <strong>{assetTicker('XRP')}</strong>
                <span>
                  {`${formatAmount(dropsToXrp(summary.spendableDrops))} spendable · ${formatAmount(
                    dropsToXrp(summary.reserveDrops),
                  )} reserved`}
                </span>
              </div>
              <div className="row-end">
                <strong>{formatAmount(dropsToXrp(summary.balanceDrops))}</strong>
                <span>{state.network.label}</span>
              </div>
            </div>

            {tokens.length === 0 ? (
              <EmptyState>
                No issued tokens yet. Add a trust line to hold a token issued on the XRP Ledger.
                Each line reserves 0.2 XRP until you remove it.
              </EmptyState>
            ) : (
              tokens.map((token) => (
                <div className="row" key={`${token.currency}-${token.issuer}`}>
                  <span className="row-badge is-token">{tokenBadgeLabel(token.display)}</span>
                  <div className="row-main">
                    <strong>{assetTicker(token.display)}</strong>
                    <span>
                      {shortenAddress(token.issuer)} · limit {formatAmount(token.limit, 4)}
                    </span>
                  </div>
                  <div className="row-end">
                    <strong>{formatAmount(token.balance, 8)}</strong>
                    {token.frozen ? <span style={{ color: 'var(--danger)' }}>Frozen</span> : null}
                  </div>
                  {token.balance === '0' ? (
                    <button
                      className="icon-button"
                      aria-label={`Remove ${assetTicker(token.display)} trust line`}
                      onClick={() =>
                        setDialog({ currency: token.currency, issuer: token.issuer, limit: '0' })
                      }
                    >
                      <TrashIcon />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </>
        )}
      </Panel>

      <Callout tone="info" title={'What a trust line does\n'}>
        A trust line lets your account hold a token from one specific issuer, up to a limit you set.
        <DocLink href={XRPL_DOCS.trustLines}>&nbsp;Read about trust lines on XRPL.org</DocLink>
      </Callout>

      <Callout tone="info" title="Why some XRP is reserved">
        The ledger holds a small amount of XRP in every account, and each trust line adds a little
        more.
        <DocLink href={XRPL_DOCS.reserves}>&nbsp;Read about account reserves on XRPL.org</DocLink>
      </Callout>

      {!canBrowse ? (
        <Callout tone="info" title="Directory covers Mainnet">
          The searchable token directory lists Mainnet tokens. On {state.network.label} you can
          still add a token by entering its currency code and issuer.
          <DocLink href={XRPL_DOCS.tokens}>&nbsp;Read about tokens on XRPL.org</DocLink>
        </Callout>
      ) : null}

      {directory ? (
        <TokenDirectory
          held={tokens.map((token) => ({ currency: token.currency, issuer: token.issuer }))}
          onClose={() => setDirectory(false)}
          onSelect={(prefill) => {
            setDirectory(false);
            setDialog(prefill);
          }}
        />
      ) : null}

      {dialog ? (
        <TrustLineDialog
          accountId={accountId}
          initial={dialog}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            portfolio.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function TrustLineDialog({
  accountId,
  initial,
  onClose,
  onDone,
}: {
  accountId: string;
  initial: { currency: string; issuer: string; limit: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const { wallet, state } = useWallet();
  const account = state.accounts.find((candidate) => candidate.id === accountId);
  const removing = initial.limit === '0' && initial.currency.length > 0;
  const [currency, setCurrency] = useState(initial.currency);
  const [issuer, setIssuer] = useState(initial.issuer);
  const [limit, setLimit] = useState(initial.limit);
  const [prepared, setPrepared] = useState<PreparedTransaction | null>(null);

  const prepare = useAsyncAction(async () => {
    setPrepared(
      await wallet.prepareTrustSet({
        accountId,
        currency: currency.trim(),
        issuer: issuer.trim(),
        limit: removing ? '0' : limit.trim(),
      }),
    );
  });

  const confirm = useAsyncAction(async () => {
    if (!prepared) return;
    // A wallet held in another app approves and signs there.
    if (account?.external) {
      await joeyProvider.signAndSubmit({
        address: account.address,
        networkId: state.network.networkId,
        transaction: prepared.transaction,
      });
      await wallet.discardPrepared({ requestId: prepared.requestId });
      onDone();
      return;
    }
    await wallet.confirmPrepared({ requestId: prepared.requestId });
    onDone();
  });

  if (prepared) {
    return (
      <Dialog title={prepared.description.headline} eyebrow="Review" onClose={onClose}>
        <p className="inline-note">{prepared.description.summary}</p>
        <DetailList
          items={prepared.description.fields.map((field) => ({
            label: field.label,
            value: field.mono ? <span className="mono">{field.value}</span> : field.value,
          }))}
        />
        <RiskFindings findings={prepared.description.findings} />
        {confirm.error ? <Callout tone="danger">{confirm.error}</Callout> : null}
        <div className="button-row">
          <Button
            variant="secondary"
            onClick={() => {
              void wallet.discardPrepared({ requestId: prepared.requestId });
              setPrepared(null);
            }}
            disabled={confirm.pending}
          >
            Back
          </Button>
          <Button
            variant="accent"
            loading={confirm.pending}
            onClick={() => void confirm.run().catch(() => undefined)}
          >
            Confirm
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={removing ? 'Remove trust line' : 'Add a trust line'} onClose={onClose}>
      {removing ? (
        <Callout tone="info">
          Removing this line frees the 0.2 XRP it reserves. It only succeeds while the balance is
          exactly zero.
        </Callout>
      ) : (
        <>
          <TextField
            label="Currency code"
            placeholder="USD, or a 40-character hex code"
            spellCheck={false}
            autoComplete="off"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          />
          <TextField
            label="Issuer address"
            placeholder="r…"
            spellCheck={false}
            autoComplete="off"
            value={issuer}
            onChange={(event) => setIssuer(event.target.value)}
          />
          <TextField
            label="Limit"
            placeholder="1000000"
            inputMode="decimal"
            autoComplete="off"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            hint="The most of this token your account will accept."
          />
        </>
      )}

      {prepare.error ? <Callout tone="danger">{prepare.error}</Callout> : null}

      <Button
        variant="accent"
        block
        style={{ marginTop: 8 }}
        loading={prepare.pending}
        disabled={
          !removing && (currency.trim() === '' || issuer.trim() === '' || limit.trim() === '')
        }
        onClick={() => void prepare.run().catch(() => undefined)}
      >
        Review
      </Button>
    </Dialog>
  );
}
