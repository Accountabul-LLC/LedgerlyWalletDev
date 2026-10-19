import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import {
  dropsToXrp,
  formatAmount,
  isValidAddress,
  shortenAddress,
  type Contact,
  type Portfolio,
  type PreparedTransaction,
  type SubmissionResult,
} from '@ledgerly/core/shared';
import { useWallet } from '../wallet';
import { BackLink, Button, Callout, Card, Field, Note, Screen, Title } from '../ui';
import { explorerTxUrl, ledgerAssetLabel } from '../format';
import { takeScan } from '../scan-result';
import { colors } from '../theme';
import { XRPL_DOCS } from '../theme';
import { parseDestinationTag } from '../../../src/ledgerly/native/destinationTag';
import { recordSignedPayment } from '../activity';

type Stage =
  | { name: 'compose' }
  | { name: 'review'; prepared: PreparedTransaction; context: string; input: string }
  | { name: 'confirm'; prepared: PreparedTransaction; context: string; input: string }
  | { name: 'sent'; result: SubmissionResult };

export default function SendScreen() {
  const router = useRouter();
  const { wallet, state, openExternal } = useWallet();
  const [stage, setStage] = useState<Stage>({ name: 'compose' });
  const [accountId, setAccountId] = useState(state.activeAccountId ?? state.accounts[0]?.id ?? '');
  const [asset, setAsset] = useState('XRP');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [tag, setTag] = useState('');
  const [memo, setMemo] = useState('');
  const [portfolio, setPortfolio] = useState<{ context: string; value: Portfolio } | null>(null);
  const [contacts, setContacts] = useState<readonly Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const accountExists = state.accounts.some((account) => account.id === accountId);
  const context = JSON.stringify([
    accountId,
    state.accounts.find((account) => account.id === accountId)?.address,
    accountExists,
    state.network.id,
    state.network.endpoint,
    state.network.networkId,
  ]);
  const input = JSON.stringify([context, asset, destination, amount, tag, memo]);
  const latest = useRef({ context, input });
  latest.current = { context, input };
  const operation = useRef(0);
  const busy = useRef<number | null>(null);
  const mounted = useRef(true);
  const preparedId = useRef<string | null>(null);
  const edit = (update: () => void) => {
    operation.current++;
    busy.current = null;
    setPending(false);
    setError(null);
    update();
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // This is a mutable request epoch, not a rendered node reference.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      operation.current++;
      if (preparedId.current)
        void wallet.discardPrepared({ requestId: preparedId.current }).catch(() => undefined);
    };
  }, [wallet]);
  useEffect(() => {
    if (
      (stage.name === 'review' || stage.name === 'confirm') &&
      (stage.context !== context || stage.input !== input)
    ) {
      void wallet.discardPrepared({ requestId: stage.prepared.requestId }).catch(() => undefined);
      preparedId.current = null;
      operation.current++;
      busy.current = null;
      setStage({ name: 'compose' });
      setPending(false);
      setError('The payment context changed. Review it again.');
    }
  }, [context, input, stage, wallet]);

  useEffect(() => {
    void wallet
      .listContacts()
      .then(setContacts)
      .catch(() => undefined);
  }, [wallet]);

  useEffect(() => {
    const scanned = takeScan();
    if (!scanned) return;
    setDestination(scanned.address);
    if (scanned.destinationTag) setTag(scanned.destinationTag);
    if (scanned.amount) setAmount(scanned.amount);
  }, []);

  useEffect(() => {
    let current = true;
    setPortfolio(null);
    operation.current++;
    busy.current = null;
    setPending(false);
    if (!accountId || !accountExists) return;
    void wallet
      .getPortfolio({ accountId })
      .then((value) => {
        if (current && mounted.current && latest.current.context === context)
          setPortfolio({ context, value });
      })
      .catch(() => {
        if (current && latest.current.context === context)
          setError('Could not load balances. Try again.');
      });
    return () => {
      current = false;
    };
  }, [accountId, accountExists, context, wallet]);

  const currentPortfolio = portfolio?.context === context ? portfolio.value : null;
  const tokens = (currentPortfolio?.tokens ?? []).filter(
    (token) => !token.isObligation && !token.frozen,
  );
  const selectedToken = tokens.find((token) => `${token.currency}:${token.issuer}` === asset);
  const assetValid =
    accountExists && currentPortfolio !== null && (asset === 'XRP' || selectedToken !== undefined);
  const spendable = currentPortfolio ? dropsToXrp(currentPortfolio.summary.spendableDrops) : '0';
  const destinationLooksValid = destination.trim().length === 0 || isValidAddress(destination);
  let parsedTag: number | undefined;
  let tagLooksValid = true;
  try {
    parsedTag = parseDestinationTag(tag);
  } catch {
    tagLooksValid = false;
  }

  const prepare = useCallback(async () => {
    if (!assetValid)
      throw new Error('The selected asset is unavailable. Refresh balances and choose it again.');
    if (!tagLooksValid) throw new Error('That destination tag is not valid.');
    return wallet.preparePayment({
      accountId,
      destination: destination.trim(),
      ...(parsedTag === undefined ? {} : { destinationTag: parsedTag }),
      amount:
        asset !== 'XRP' && selectedToken
          ? {
              kind: 'token',
              value: amount.trim(),
              currency: selectedToken.currency,
              issuer: selectedToken.issuer,
            }
          : { kind: 'xrp', value: amount.trim() },
      ...(memo.trim() ? { memo: memo.trim() } : {}),
    });
  }, [
    accountId,
    amount,
    asset,
    assetValid,
    destination,
    memo,
    parsedTag,
    selectedToken,
    tagLooksValid,
    wallet,
  ]);

  if (state.status === 'locked') return <Redirect href="/unlock" />;
  if (
    state.status !== undefined &&
    (state.status !== 'unlocked' || !state.preferences.backupConfirmed)
  ) {
    return <Redirect href="/setup" />;
  }

  if (stage.name === 'sent') {
    const explorer = explorerTxUrl(state.network, stage.result.hash);
    return (
      <Screen>
        <Title>{stage.result.succeeded ? 'Sent' : 'Not completed'}</Title>
        <Callout tone={stage.result.succeeded ? 'positive' : 'danger'}>
          {stage.result.message}
        </Callout>
        <Note>{shortenAddress(stage.result.hash, 10, 8)}</Note>
        {explorer ? (
          <Button
            label="View on explorer"
            variant="secondary"
            onPress={() => openExternal(explorer)}
          />
        ) : null}
        <Button label="Done" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  if (
    (stage.name === 'review' || stage.name === 'confirm') &&
    stage.context === context &&
    stage.input === input
  ) {
    const prepared = stage.prepared;
    const isTest = state.network.isTest;
    const lastCheck = stage.name === 'confirm';
    return (
      <Screen>
        <Title>
          {lastCheck
            ? isTest
              ? 'Send test funds?'
              : 'This is real money'
            : prepared.description.headline}
        </Title>
        {isTest ? (
          <Callout tone="caution" title={`${state.network.label} · test`}>
            This payment is on {state.network.label}. These funds are not Mainnet assets.
          </Callout>
        ) : (
          <Note>{state.network.label}</Note>
        )}
        {lastCheck ? (
          <Callout tone={isTest ? 'caution' : 'danger'}>
            {isTest
              ? `${state.network.label} funds have no value. This is practice, but the steps are the same as a live payment.`
              : 'This payment moves real value on the XRP Ledger. Once it is sent it cannot be reversed.'}
          </Callout>
        ) : (
          <Note>{prepared.description.summary}</Note>
        )}
        <Card>
          {prepared.description.fields.map((field) => (
            <View key={field.label} style={{ paddingVertical: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{field.label}</Text>
              <Text style={{ color: colors.ink, fontWeight: field.mono ? '500' : '600' }}>
                {field.value}
              </Text>
            </View>
          ))}
        </Card>
        {prepared.description.findings.map((finding) => (
          <Callout
            key={finding.title}
            tone={finding.level === 'info' ? 'info' : finding.level}
            title={finding.title}
          >
            {finding.detail}
          </Callout>
        ))}
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <Button
          label={error ? 'Edit and build again' : 'Back'}
          variant="secondary"
          disabled={pending}
          onPress={() => {
            if (pending) return;
            if (lastCheck && !error) {
              setStage({ name: 'review', prepared, context: stage.context, input: stage.input });
              return;
            }
            preparedId.current = null;
            void wallet.discardPrepared({ requestId: prepared.requestId }).catch(() => undefined);
            setError(null);
            setStage({ name: 'compose' });
          }}
        />
        {lastCheck ? (
          <Button
            label={isTest ? 'Yes, send it' : 'Yes, send real funds'}
            variant={isTest ? 'accent' : 'danger'}
            loading={pending}
            disabled={Boolean(error) || pending}
            onPress={() => {
              if (
                error ||
                pending ||
                busy.current !== null ||
                latest.current.context !== stage.context ||
                latest.current.input !== stage.input
              )
                return;
              const attempt = ++operation.current;
              busy.current = attempt;
              setPending(true);
              setError(null);
              void wallet
                .confirmPrepared({ requestId: prepared.requestId })
                .then((result) => {
                  if (preparedId.current === prepared.requestId) preparedId.current = null;
                  if (result.succeeded) recordSignedPayment(state.network.id, result.hash);
                  if (
                    mounted.current &&
                    attempt === operation.current &&
                    latest.current.context === stage.context
                  )
                    setStage({ name: 'sent', result });
                })
                .catch((caught: unknown) => {
                  if (
                    mounted.current &&
                    attempt === operation.current &&
                    latest.current.context === stage.context
                  )
                    setError(caught instanceof Error ? caught.message : 'Could not send.');
                })
                .finally(() => {
                  if (busy.current === attempt) busy.current = null;
                  if (mounted.current && attempt === operation.current) setPending(false);
                });
            }}
          />
        ) : (
          <Button
            label="Confirm and send"
            onPress={() =>
              setStage({ name: 'confirm', prepared, context: stage.context, input: stage.input })
            }
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <BackLink label="← Cancel" onPress={() => router.back()} />
      <Title>Send</Title>
      <Note>{state.network.label}</Note>

      <Text style={{ fontWeight: '700', color: colors.ink }}>From wallet</Text>
      {state.accounts.map((account) => (
        <Button
          key={account.id}
          label={`${account.id === accountId ? '✓ ' : ''}${account.label} — ${shortenAddress(account.address, 6, 4)}`}
          variant={account.id === accountId ? 'accent' : 'ghost'}
          onPress={() => {
            edit(() => {
              setPortfolio(null);
              setAccountId(account.id);
              setAsset('XRP');
            });
          }}
        />
      ))}

      <Text style={{ fontWeight: '700', color: colors.ink }}>Asset</Text>
      <Button
        label={`${asset === 'XRP' ? '✓ ' : ''}${ledgerAssetLabel('XRP')} — ${formatAmount(spendable)} available`}
        variant={asset === 'XRP' ? 'secondary' : 'ghost'}
        onPress={() => edit(() => setAsset('XRP'))}
      />
      {tokens.map((token) => {
        const id = `${token.currency}:${token.issuer}`;
        return (
          <Button
            key={id}
            label={`${asset === id ? '✓ ' : ''}${ledgerAssetLabel(token.display)} — ${formatAmount(token.balance, 8)}`}
            variant={asset === id ? 'secondary' : 'ghost'}
            onPress={() => edit(() => setAsset(id))}
          />
        );
      })}

      <Field
        label="Recipient"
        autoCapitalize="none"
        autoCorrect={false}
        value={destination}
        onChangeText={(value) => edit(() => setDestination(value))}
        error={destinationLooksValid ? null : 'That is not a valid XRP Ledger address.'}
        hint="Paste an address, pick a contact, or scan their QR code."
      />
      <Button label="Scan QR code" variant="secondary" onPress={() => router.push('/scan')} />
      {contacts.slice(0, 6).map((contact) => (
        <Button
          key={contact.id}
          label={contact.label}
          variant="ghost"
          onPress={() => {
            edit(() => {
              setDestination(contact.address);
              setTag(contact.destinationTag === undefined ? '' : String(contact.destinationTag));
            });
          }}
        />
      ))}

      <Field
        label="Amount"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(value) => edit(() => setAmount(value))}
        hint={
          selectedToken
            ? `${formatAmount(selectedToken.balance, 8)} ${ledgerAssetLabel(selectedToken.display)} available`
            : asset === 'XRP'
              ? `${formatAmount(spendable)} ${ledgerAssetLabel('XRP')} spendable after the account reserve`
              : 'The selected asset is unavailable. Refresh balances and choose it again.'
        }
      />
      <Field
        label="Destination tag (optional)"
        keyboardType="number-pad"
        value={tag}
        onChangeText={(value) => edit(() => setTag(value))}
        error={tagLooksValid ? undefined : 'That destination tag is not valid.'}
      />
      <Pressable onPress={() => openExternal(XRPL_DOCS.destinationTags)}>
        <Text style={{ color: colors.purple }}>Read about destination tags on XRPL.org</Text>
      </Pressable>
      <Field
        label="Memo (optional)"
        value={memo}
        onChangeText={(value) => edit(() => setMemo(value))}
      />
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Button
        label="Review transaction"
        disabled={
          pending ||
          !assetValid ||
          accountId.length === 0 ||
          destination.trim().length === 0 ||
          amount.trim().length === 0 ||
          !destinationLooksValid ||
          !tagLooksValid
        }
        loading={pending}
        onPress={() => {
          if (pending || busy.current !== null || !assetValid) return;
          const attempt = ++operation.current;
          busy.current = attempt;
          const expected = { context, input };
          setPending(true);
          setError(null);
          void prepare()
            .then((prepared) => {
              if (
                !mounted.current ||
                attempt !== operation.current ||
                latest.current.context !== expected.context ||
                latest.current.input !== expected.input
              ) {
                void wallet
                  .discardPrepared({ requestId: prepared.requestId })
                  .catch(() => undefined);
                return;
              }
              preparedId.current = prepared.requestId;
              setStage({ name: 'review', prepared, ...expected });
            })
            .catch((caught: unknown) => {
              if (
                mounted.current &&
                attempt === operation.current &&
                latest.current.input === expected.input
              )
                setError(caught instanceof Error ? caught.message : 'Could not prepare payment.');
            })
            .finally(() => {
              if (busy.current === attempt) busy.current = null;
              if (mounted.current && attempt === operation.current) setPending(false);
            });
        }}
      />
    </Screen>
  );
}
