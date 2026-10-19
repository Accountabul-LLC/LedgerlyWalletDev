import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInputProps } from 'react-native';
import type { WalletState } from '../../../src/ledgerly/core';
import type { ForegroundWallet } from '../../../src/ledgerly/native/foreground';
import type { NativeWallet } from './wallet';
import { BRAND } from './brand';

type ButtonProps = { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean };
type Props = {
  wallet: NativeWallet;
  state: WalletState;
  runSensitive: ForegroundWallet['run'];
  onStateChanged: () => Promise<void>;
  onClose: () => void;
  controls: {
    Field: ComponentType<TextInputProps & { label: string }>;
    Button: ComponentType<ButtonProps>;
  };
};
type Preview = Awaited<ReturnType<NativeWallet['previewImport']>>;
type Step = 'list' | 'create' | 'import' | 'backup' | 'review' | 'rename';

/** Fresh/imported secrets stay in this mounted foreground screen until confirmation. */
export function WalletManager({
  wallet,
  state,
  runSensitive,
  onStateChanged,
  onClose,
  controls,
}: Props) {
  const { Field, Button } = controls;
  const [step, setStep] = useState<Step>('list');
  const [label, setLabel] = useState('');
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secret = useRef<string | null>(null);
  const renameId = useRef<string | null>(null);
  const epoch = useRef(0);
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // This is an operation generation, not a captured DOM ref; invalidate the current one.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++;
      secret.current = null;
    };
  }, []);

  function clear() {
    secret.current = null;
    setInput('');
    setPreview(null);
    setSaved(false);
    setError(null);
  }
  async function perform<T>(
    operation: () => Promise<T>,
    accept: (value: T) => Promise<void> | void,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const generation = epoch.current;
    try {
      const value = await runSensitive(operation);
      if (!alive.current || generation !== epoch.current) return;
      await accept(value);
    } catch (caught) {
      if (alive.current && generation === epoch.current) setError(publicWalletError(caught));
    } finally {
      pending.current = false;
      if (alive.current && generation === epoch.current) setBusy(false);
    }
  }
  function begin(next: 'create' | 'import') {
    clear();
    setLabel(`Wallet ${state.accounts.length + 1}`);
    setStep(next);
  }
  const walletName = label.trim();
  const nameAccepted = walletName.length > 0 && walletName.length <= 40;
  async function commit() {
    if (!nameAccepted || !preview || !secret.current || (step === 'backup' && !saved)) return;
    const value = secret.current;
    await perform(
      () =>
        preview.kind === 'mnemonic'
          ? wallet.addAccountWithOwnPhrase({
              label: walletName,
              mnemonic: value,
              expectedAddress: preview.address,
            })
          : wallet.importAccount({
              label: walletName,
              seed: value,
              expectedAddress: preview.address,
            }),
      async (account) => {
        clear();
        await wallet.selectAccount({ accountId: account.id });
        await onStateChanged();
        if (alive.current) setStep('list');
      },
    );
  }
  const nameField = (
    <Field
      label="Wallet name"
      value={label}
      onChangeText={setLabel}
      maxLength={40}
      editable={!busy}
    />
  );

  return (
    <View style={styles.stack}>
      <Text style={styles.title}>
        {step === 'backup'
          ? 'Back up this wallet'
          : step === 'review'
            ? 'Confirm wallet import'
            : 'Manage wallets'}
      </Text>
      <Text style={styles.copy}>
        One profile and one device vault password. Each independent wallet has its own recovery
        secret.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {busy ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          Working…
        </Text>
      ) : null}
      {step === 'list' ? (
        <>
          {state.accounts.map((account) => (
            <View key={account.id} style={styles.card}>
              <Text style={styles.label}>{account.label}</Text>
              <Text selectable style={styles.address}>
                {account.address}
              </Text>
              <Button
                label={
                  state.activeAccountId === account.id
                    ? `Selected: ${account.label}`
                    : `Select ${account.label}`
                }
                disabled={busy || state.activeAccountId === account.id}
                secondary
                onPress={() =>
                  void perform(
                    () => wallet.selectAccount({ accountId: account.id }),
                    onStateChanged,
                  )
                }
              />
              <Button
                label={`Rename ${account.label}`}
                disabled={busy}
                secondary
                onPress={() => {
                  clear();
                  renameId.current = account.id;
                  setLabel(account.label);
                  setStep('rename');
                }}
              />
            </View>
          ))}
          <Button
            label="Create independent wallet"
            disabled={busy}
            onPress={() => begin('create')}
          />
          <Button
            label="Import another wallet"
            disabled={busy}
            secondary
            onPress={() => begin('import')}
          />
          <Button label="Done" disabled={busy} secondary onPress={onClose} />
        </>
      ) : null}
      {step === 'create' ? (
        <>
          {nameField}
          <Button
            label="Generate recovery phrase"
            disabled={busy || !nameAccepted}
            onPress={() =>
              void perform(
                async () => {
                  const generated = await wallet.generateRecoveryPhrase();
                  const checked = await wallet.previewImport({ secret: generated.mnemonic });
                  if (checked.alreadyPresent)
                    throw new Error('That wallet is already on this device.');
                  return { generated, checked };
                },
                ({ generated, checked }) => {
                  secret.current = generated.mnemonic;
                  setPreview(checked);
                  setSaved(false);
                  setStep('backup');
                },
              )
            }
          />
        </>
      ) : null}
      {step === 'import' ? (
        <>
          {nameField}
          <Field
            label="Recovery phrase or XRPL secret"
            value={input}
            onChangeText={setInput}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
            editable={!busy}
          />
          <Button
            label="Preview wallet"
            disabled={busy || !input.trim() || !nameAccepted}
            onPress={() =>
              void perform(
                () => wallet.previewImport({ secret: input }),
                (checked) => {
                  if (checked.alreadyPresent)
                    throw new Error('That wallet is already on this device.');
                  secret.current = input;
                  setInput('');
                  setPreview(checked);
                  setStep('review');
                },
              )
            }
          />
        </>
      ) : null}
      {step === 'backup' ? (
        <>
          <Text style={styles.copy}>
            Write down all 24 words in order. This wallet will be added only after you confirm its
            backup.
          </Text>
          <View style={styles.grid}>
            {(secret.current ?? '').split(' ').map((word, index) => (
              <View key={index} style={styles.wordCard}>
                <Text style={styles.number}>{index + 1}</Text>
                <Text style={styles.word}>{word}</Text>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: saved }}
            accessibilityLabel="I saved this wallet's recovery phrase offline."
            disabled={busy}
            onPress={() => setSaved((value) => !value)}
            style={styles.ack}
          >
            <Text>{saved ? '☑' : '☐'} I saved this wallet's recovery phrase offline.</Text>
          </Pressable>
        </>
      ) : null}
      {step === 'backup' || step === 'review' ? (
        <>
          <Text style={styles.label}>{label}</Text>
          <Text selectable style={styles.address}>
            {preview?.address}
          </Text>
          <Button
            label={busy ? 'Adding wallet…' : 'Add wallet'}
            disabled={busy || !nameAccepted || (step === 'backup' && !saved)}
            onPress={() => void commit()}
          />
        </>
      ) : null}
      {step === 'rename' ? (
        <>
          {nameField}
          <Button
            label="Save wallet name"
            disabled={busy || !nameAccepted}
            onPress={() => {
              if (!nameAccepted || !renameId.current) return;
              void perform(
                () => wallet.renameAccount({ accountId: renameId.current!, label: walletName }),
                async () => {
                  await onStateChanged();
                  if (alive.current) setStep('list');
                },
              );
            }}
          />
        </>
      ) : null}
      {step !== 'list' ? (
        <Button
          label="Cancel"
          disabled={busy}
          secondary
          onPress={() => {
            clear();
            setStep('list');
          }}
        />
      ) : null}
    </View>
  );
}

function publicWalletError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : '';
  // Native/library errors must never echo an imported secret into an alert or screenshot.
  const safe = [
    'That wallet is already on this device.',
    'That recovery phrase is not valid. Check the spelling and word order.',
    'The wallet locked. Please unlock and try again.',
  ];
  return safe.includes(message)
    ? message
    : 'Could not update this wallet. Check the recovery input, or unlock and try again.';
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  title: { fontSize: 24, fontWeight: '700', color: BRAND.ink },
  copy: { fontSize: 14, lineHeight: 21, color: BRAND.muted },
  label: { fontSize: 16, fontWeight: '700', color: BRAND.ink },
  address: { fontSize: 12, color: BRAND.muted },
  error: { color: BRAND.danger },
  card: { padding: 16, gap: 10, borderRadius: 16, backgroundColor: BRAND.paper },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordCard: {
    flexBasis: '45%',
    minWidth: 120,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    backgroundColor: BRAND.paper,
    borderRadius: 10,
  },
  number: { minWidth: 18, flexShrink: 0, fontVariant: ['tabular-nums'], color: BRAND.muted },
  word: { flex: 1, flexShrink: 1, fontWeight: '700', color: BRAND.ink },
  ack: { padding: 12, borderRadius: 10, backgroundColor: BRAND.paper },
});
