import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dropsToXrp,
  formatAmount,
  isValidAddress,
  shortenAddress,
  type Portfolio,
  type PreparedTransaction,
  type SubmissionResult,
} from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { findRecipients, type RecipientSuggestion } from '../recipients';
import { RecipientSuggestions } from '../components/RecipientSuggestions';
import { INVALIDATE_EVENT } from '../session';
import { recordSignedPayment } from '../metrics';
import { useAsyncAction, useAsyncData } from '../store';
import {
  Button,
  Callout,
  DetailList,
  Dialog,
  DocLink,
  Field,
  RiskFindings,
  SelectField,
  TextField,
} from '../components/primitives';
import { ExternalIcon, JoeyMark, ScanIcon } from '../components/icons';
import { QrScanner } from '../components/QrScanner';
import { assetTicker, explorerTxUrl } from '../format';
import { joeyProvider } from '../external/joey';
import { XRPL_DOCS } from '../docs';

/** What was actually signed, kept only to report an anonymous dollar total. */
type Signed = { amount: string; currency: string; accountId: string };

type Stage =
  | { name: 'compose' }
  | { name: 'review'; prepared: PreparedTransaction; signed: Signed }
  | { name: 'sent'; result: SubmissionResult };

export function Send({
  accountId,
  portfolio,
  onClose,
  onSent,
}: {
  accountId?: string;
  portfolio?: Portfolio | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ name: 'compose' });

  // Anything that ends or changes the session, in this tab or another one,
  // takes the draft with it rather than leaving a signed review on screen.
  useEffect(() => {
    const drop = () => onClose();
    window.addEventListener(INVALIDATE_EVENT, drop);
    return () => window.removeEventListener(INVALIDATE_EVENT, drop);
  }, [onClose]);

  if (stage.name === 'review') {
    return (
      <ReviewStage
        prepared={stage.prepared}
        signed={stage.signed}
        onBack={() => setStage({ name: 'compose' })}
        onClose={onClose}
        onSent={(result) => setStage({ name: 'sent', result })}
      />
    );
  }

  if (stage.name === 'sent') {
    return <SentStage result={stage.result} onDone={onSent} />;
  }

  return (
    <ComposeStage
      initialAccountId={accountId}
      initialPortfolio={portfolio ?? null}
      onClose={onClose}
      onPrepared={(prepared, signed) => setStage({ name: 'review', prepared, signed })}
    />
  );
}

function ComposeStage({
  initialAccountId,
  initialPortfolio,
  onClose,
  onPrepared,
}: {
  initialAccountId?: string;
  initialPortfolio: Portfolio | null;
  onClose: () => void;
  onPrepared: (prepared: PreparedTransaction, signed: Signed) => void;
}) {
  const { wallet, state } = useWallet();
  const startingAccountId =
    initialAccountId ?? state.activeAccountId ?? state.accounts[0]?.id ?? '';
  const [accountId, setAccountId] = useState(startingAccountId);
  const [asset, setAsset] = useState('XRP');
  const [destination, setDestination] = useState('');
  const [recipientQuery, setRecipientQuery] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientSuggestion | null>(null);
  const [amount, setAmount] = useState('');
  const [tag, setTag] = useState('');
  const [memo, setMemo] = useState('');
  const [scanning, setScanning] = useState(false);

  const contacts = useAsyncData(() => wallet.listContacts(), []);
  const suggestions = findRecipients(
    recipientQuery,
    state.accounts.filter((account) => account.id !== accountId),
    contacts.data ?? [],
  );
  const chooseRecipient = (recipient: RecipientSuggestion) => {
    setDestination(recipient.address);
    setTag(recipient.destinationTag?.toString() ?? '');
    setSelectedRecipient(recipient);
    setRecipientQuery('');
  };

  // The wallet passed in already has its portfolio loaded; any other wallet the
  // person picks is fetched on demand so the asset list is never stale.
  const fetched = useAsyncData(
    async () =>
      accountId && accountId !== initialAccountId ? wallet.getPortfolio({ accountId }) : null,
    [accountId, initialAccountId, state.network.id],
  );
  const portfolio = accountId === initialAccountId ? initialPortfolio : fetched.data;

  const account = state.accounts.find((candidate) => candidate.id === accountId);
  const tokens = (portfolio?.tokens ?? []).filter((token) => !token.isObligation && !token.frozen);
  const selectedToken = tokens.find((token) => `${token.currency}:${token.issuer}` === asset);

  const spendable = portfolio ? dropsToXrp(portfolio.summary.spendableDrops) : '0';
  const destinationLooksValid =
    destination.trim().length === 0 || isValidAddress(destination) || suggestions.length > 0;
  const trimmedTag = tag.trim();
  const parsedTag = trimmedTag.length > 0 ? Number(trimmedTag) : undefined;
  const tagLooksValid =
    parsedTag === undefined ||
    (/^\d+$/.test(trimmedTag) &&
      Number.isInteger(parsedTag) &&
      parsedTag >= 0 &&
      parsedTag <= 4294967295);

  const prepare = useAsyncAction(async () => {
    if (!tagLooksValid)
      throw new Error(
        'That destination tag is not valid. Use a whole number from 0 to 4294967295.',
      );
    const prepared = await wallet.preparePayment({
      accountId,
      destination: destination.trim(),
      ...(parsedTag === undefined ? {} : { destinationTag: parsedTag }),
      amount: selectedToken
        ? {
            kind: 'token',
            value: amount.trim(),
            currency: selectedToken.currency,
            issuer: selectedToken.issuer,
          }
        : { kind: 'xrp', value: amount.trim() },
      ...(memo.trim() ? { memo: memo.trim() } : {}),
    });
    onPrepared(prepared, {
      accountId,
      amount: amount.trim(),
      currency: selectedToken ? selectedToken.currency : 'XRP',
    });
  });

  const ready =
    accountId.length > 0 &&
    destination.trim().length > 0 &&
    amount.trim().length > 0 &&
    isValidAddress(destination) &&
    tagLooksValid;

  const onScanned = useCallback(
    (result: { address: string; destinationTag?: string; amount?: string }) => {
      setDestination(result.address);
      setTag(result.destinationTag ?? '');
      setSelectedRecipient(null);
      setRecipientQuery('');
      if (result.amount) setAmount(result.amount);
      setScanning(false);
    },
    [],
  );

  if (scanning) {
    return (
      <Dialog title="Scan a QR code" eyebrow="Recipient" onClose={() => setScanning(false)}>
        <QrScanner onResult={onScanned} onCancel={() => setScanning(false)} />
      </Dialog>
    );
  }

  return (
    <Dialog title="Send" eyebrow={state.network.label} onClose={onClose}>
      <SelectField
        label="From wallet"
        value={accountId}
        onChange={(event) => {
          setAccountId(event.target.value);
          setAsset('XRP');
        }}
        hint={account ? <span className="mono">{account.address}</span> : undefined}
      >
        {state.accounts.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {`${candidate.label} — ${shortenAddress(candidate.address, 6, 4)}`}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Asset"
        value={asset}
        onChange={(event) => setAsset(event.target.value)}
        hint={
          fetched.loading && accountId !== initialAccountId
            ? 'Loading what this wallet holds…'
            : undefined
        }
      >
        <option value="XRP">{`${assetTicker('XRP')} — ${formatAmount(spendable)} available`}</option>
        {tokens.map((token) => (
          <option
            key={`${token.currency}:${token.issuer}`}
            value={`${token.currency}:${token.issuer}`}
          >
            {`${assetTicker(token.display)} — ${formatAmount(token.balance, 8)} available`}
          </option>
        ))}
      </SelectField>

      <Field
        label="Recipient"
        error={destinationLooksValid ? null : 'That is not a valid XRP Ledger address.'}
        hint="Type a wallet/contact name, paste an XRP Ledger address, or scan their QR code."
      >
        {(id) => (
          <span className="input-action">
            <input
              id={id}
              placeholder="r… or X… address"
              spellCheck={false}
              autoComplete="off"
              value={destination}
              aria-invalid={destinationLooksValid ? undefined : true}
              onChange={(event) => {
                setDestination(event.target.value);
                setRecipientQuery(event.target.value);
                setSelectedRecipient(null);
                setTag('');
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Scan a QR code"
              title="Scan a QR code"
              onClick={() => setScanning(true)}
            >
              <ScanIcon />
            </button>
          </span>
        )}
      </Field>

      <RecipientSuggestions suggestions={suggestions} onPick={chooseRecipient} />
      {selectedRecipient ? (
        <p className="inline-note">
          Selected {selectedRecipient.label}
          {selectedRecipient.note ? ` - ${selectedRecipient.note}` : ''}
        </p>
      ) : null}

      <TextField
        label="Amount"
        placeholder="0.00"
        inputMode="decimal"
        autoComplete="off"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        hint={
          selectedToken
            ? `${formatAmount(selectedToken.balance, 8)} ${assetTicker(selectedToken.display)} available`
            : `${formatAmount(spendable)} ${assetTicker('XRP')} spendable after the account reserve`
        }
      />

      <TextField
        label="Destination tag (optional)"
        placeholder="Required by most exchanges"
        inputMode="numeric"
        autoComplete="off"
        value={tag}
        onChange={(event) => setTag(event.target.value.replace(/[^0-9]/g, ''))}
      />
      <DocLink href={XRPL_DOCS.destinationTags}>Read about destination tags on XRPL.org</DocLink>

      <TextField
        label="Memo (optional)"
        placeholder="Visible to everyone on the ledger"
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
      />

      {prepare.error ? <Callout tone="danger">{prepare.error}</Callout> : null}

      <Button
        variant="accent"
        block
        style={{ marginTop: 8 }}
        disabled={!ready}
        loading={prepare.pending}
        onClick={() => void prepare.run().catch(() => undefined)}
      >
        Review transaction
      </Button>
    </Dialog>
  );
}

/**
 * The approval screen for a transaction the user built themselves. It shows the
 * autofilled transaction — real fee, real sequence — because that is the object
 * the engine will sign.
 */
function ReviewStage({
  prepared,
  signed,
  onBack,
  onClose,
  onSent,
}: {
  prepared: PreparedTransaction;
  signed: Signed;
  onBack: () => void;
  onClose: () => void;
  onSent: (result: SubmissionResult) => void;
}) {
  const { wallet, state } = useWallet();
  const [confirming, setConfirming] = useState(false);
  const isTest = state.network.isTest;

  // Wallets held in another app are signed there. Ledgerly still builds and
  // describes the transaction, then hands that exact object to the outside
  // wallet, which shows its own approval screen.
  const sender = state.accounts.find((candidate) => candidate.id === signed.accountId);
  const external = sender?.external ?? null;

  const confirm = useAsyncAction(async () => {
    if (external && sender) {
      const submission = await joeyProvider.signAndSubmit({
        address: sender.address,
        networkId: state.network.networkId,
        transaction: prepared.transaction,
      });
      await wallet.discardPrepared({ requestId: prepared.requestId });
      if (submission.succeeded) {
        recordSignedPayment(state.network.id, submission.hash);
      }
      onSent({ ...submission, validated: false });
      return;
    }
    const result = await wallet.confirmPrepared({ requestId: prepared.requestId });
    if (result.succeeded) {
      recordSignedPayment(state.network.id, result.hash);
    }
    onSent(result);
  });

  const cancel = () => {
    void wallet.discardPrepared({ requestId: prepared.requestId });
    onBack();
  };

  const summaryFields = useMemo(
    () =>
      prepared.description.fields.filter((field) =>
        /amount|to|destination|total|fee/i.test(field.label),
      ),
    [prepared],
  );

  if (confirming) {
    return (
      <Dialog
        title={isTest ? 'Send test funds?' : 'This is real money'}
        eyebrow="Last check"
        onClose={onClose}
      >
        <Callout tone={isTest ? 'caution' : 'danger'}>
          {isTest
            ? `${state.network.label} funds have no value. This is practice, but the steps are the same as a live payment.`
            : 'This payment moves real value on the XRP Ledger. Once it is sent it cannot be reversed, cancelled, or refunded by anyone.'}
        </Callout>

        <DetailList
          items={(summaryFields.length > 0 ? summaryFields : prepared.description.fields).map(
            (field) => ({
              label: field.label,
              value: field.mono ? <span className="mono">{field.value}</span> : field.value,
            }),
          )}
        />

        {confirm.error ? <Callout tone="danger">{confirm.error}</Callout> : null}

        <div className="button-row">
          <Button
            variant="secondary"
            onClick={() => setConfirming(false)}
            disabled={confirm.pending}
          >
            Back
          </Button>
          <Button
            variant={isTest ? 'accent' : 'danger'}
            loading={confirm.pending}
            onClick={() => void confirm.run().catch(() => undefined)}
          >
            {external ? (
              <>
                <JoeyMark aria-hidden="true" /> Approve in Joey
              </>
            ) : isTest ? (
              'Yes, send it'
            ) : (
              'Yes, send real funds'
            )}
          </Button>
        </div>
      </Dialog>
    );
  }

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

      <div className="button-row">
        <Button variant="secondary" onClick={cancel}>
          Back
        </Button>
        <Button variant="accent" onClick={() => setConfirming(true)}>
          Confirm and send
        </Button>
      </div>
    </Dialog>
  );
}

function SentStage({ result, onDone }: { result: SubmissionResult; onDone: () => void }) {
  const { state, openExternal } = useWallet();
  const explorer = explorerTxUrl(state.network, result.hash);

  return (
    <Dialog title={result.succeeded ? 'Sent' : 'Not completed'} onClose={onDone}>
      <Callout tone={result.succeeded ? 'positive' : 'danger'}>{result.message}</Callout>

      <DetailList
        items={[
          { label: 'Result', value: result.engineResult },
          {
            label: 'Transaction',
            value: <span className="mono">{shortenAddress(result.hash, 10, 8)}</span>,
          },
          ...(result.ledgerIndex ? [{ label: 'Ledger', value: String(result.ledgerIndex) }] : []),
        ]}
      />

      {explorer ? (
        <Button variant="secondary" block onClick={() => openExternal(explorer)}>
          <ExternalIcon /> View on explorer
        </Button>
      ) : null}

      <Button variant="primary" block style={{ marginTop: 8 }} onClick={onDone}>
        Done
      </Button>
    </Dialog>
  );
}
