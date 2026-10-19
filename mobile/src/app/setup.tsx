import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import type { PasswordAssessment } from '@ledgerly/core/shared';
import { useWallet } from '../wallet';
import { BackLink, BrandMark, Button, Callout, Field, Note, Screen, Title } from '../ui';
import { buildChallenge, digestWord, type Challenge } from '../challenge';
import { forgetChallenge, loadChallenge, rememberChallenge } from '../backup-challenge';
import { recordPlatformEvent } from '../activity';
import { restoreRememberedNames } from '../sync';
import { supabase } from '../supabase';
import { colors } from '../theme';

function usePhrasePrivacy(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let allow: (() => void) | null = null;
    // Loaded on demand so a binary without the native module can still open setup.
    void import('expo-screen-capture')
      .then((capture) => {
        if (!active) return;
        allow = () => {
          void capture.allowScreenCaptureAsync('ledgerly-phrase').catch(() => undefined);
        };
        return capture.preventScreenCaptureAsync('ledgerly-phrase');
      })
      .catch(() => undefined);
    return () => {
      active = false;
      allow?.();
    };
  }, [enabled]);
}

type PhraseBox = { value: string | null };
type Mode = 'create' | 'importPhrase' | 'importSecret';
type Step =
  | { name: 'welcome' }
  | { name: 'password'; mode: Mode }
  | { name: 'backup' }
  | { name: 'verify'; challenge: Challenge }
  | { name: 'reveal'; challenge: Challenge };

export default function SetupScreen() {
  const { state } = useWallet();
  const [step, setStep] = useState<Step>({ name: 'welcome' });
  const [savedChallenge, setSavedChallenge] = useState<Challenge | null>(null);
  const phrase = useRef<PhraseBox>({ value: null });

  const toBackup = useCallback((mnemonic: string) => {
    phrase.current.value = mnemonic;
    setSavedChallenge(null);
    void forgetChallenge();
    setStep({ name: 'backup' });
  }, []);

  useEffect(() => () => void (phrase.current.value = null), []);

  useEffect(() => {
    let active = true;
    void loadChallenge().then((challenge) => {
      if (active && challenge) setSavedChallenge(challenge);
    });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'locked') return <Redirect href="/unlock" />;

  if (step.name === 'reveal') {
    return (
      <ResumeBackup
        onBack={() => setStep({ name: 'verify', challenge: step.challenge })}
        onRevealed={toBackup}
      />
    );
  }

  if (
    state.status === 'unlocked' &&
    !state.preferences.backupConfirmed &&
    step.name !== 'backup' &&
    step.name !== 'verify'
  ) {
    return (
      <ResumeBackup
        onBack={
          savedChallenge ? () => setStep({ name: 'verify', challenge: savedChallenge }) : undefined
        }
        onRevealed={toBackup}
      />
    );
  }

  if (step.name === 'welcome') {
    return <Welcome onChoose={(mode) => setStep({ name: 'password', mode })} />;
  }
  if (step.name === 'password') {
    return (
      <PasswordStep
        mode={step.mode}
        onBack={() => setStep({ name: 'welcome' })}
        onCreated={toBackup}
      />
    );
  }
  if (step.name === 'backup') {
    return (
      <BackupStep
        phrase={phrase.current}
        onContinue={(challenge) => {
          setSavedChallenge(challenge);
          void rememberChallenge(challenge);
          setStep({ name: 'verify', challenge });
        }}
      />
    );
  }
  return (
    <VerifyStep
      challenge={step.challenge}
      onBack={() => setStep({ name: 'reveal', challenge: step.challenge })}
    />
  );
}

function Welcome({ onChoose }: { onChoose: (mode: Mode) => void }) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  return (
    <Screen>
      <BrandMark />
      <Title>{signedIn ? 'Set up this device' : 'Your keys, yours alone.'}</Title>
      <Note>
        {signedIn
          ? 'You are signed in to your Ledgerly profile. To send from this phone, create a new wallet or restore the keys for an existing one. You can also open watch-only balances without restoring keys.'
          : 'Your XRP Ledger keys are created on this phone and stay encrypted here. Ledgerly never holds them, nothing is uploaded, and no server ever sees your recovery phrase.'}
      </Note>
      {signedIn ? (
        <Button label="Open my wallet dashboard" onPress={() => router.push('/profile')} />
      ) : (
        <Button
          label="Sign in to a profile"
          variant="secondary"
          onPress={() => router.push('/sign-in')}
        />
      )}
      <Button
        label="Create a new wallet"
        variant={signedIn ? 'secondary' : 'accent'}
        onPress={() => onChoose('create')}
      />
      <Button
        label="Restore from a recovery phrase"
        variant="secondary"
        onPress={() => onChoose('importPhrase')}
      />
      <Button
        label="Import an XRPL secret"
        variant="ghost"
        onPress={() => onChoose('importSecret')}
      />
      <Button
        label="Explore XRPL markets"
        variant="secondary"
        onPress={() => router.push('/market')}
      />
      <Callout tone="positive" title="Non-custodial">
        You alone hold the keys. If you lose your recovery phrase and your password, nobody can
        restore access.
      </Callout>
    </Screen>
  );
}

function PasswordStep({
  mode,
  onBack,
  onCreated,
}: {
  mode: Mode;
  onBack: () => void;
  onCreated: (mnemonic: string) => void;
}) {
  const router = useRouter();
  const { wallet, store, state } = useWallet();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phrase, setPhrase] = useState('');
  const [secret, setSecret] = useState('');
  const [assessment, setAssessment] = useState<PasswordAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [networkId, setNetworkId] = useState('mainnet');
  usePhrasePrivacy(mode === 'importPhrase');

  const mismatch = confirm.length > 0 && confirm !== password;
  const ready =
    password.length > 0 &&
    confirm === password &&
    (assessment?.acceptable ?? false) &&
    (mode !== 'importPhrase' || phrase.trim().length > 0) &&
    (mode !== 'importSecret' || secret.trim().length > 0);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await wallet.setNetwork({ networkId });
      if (mode === 'importSecret') {
        await wallet.importFromSeed({ password, seed: secret.trim() });
        const seeded = await store.refresh();
        await restoreRememberedNames(wallet, seeded.accounts).catch(() => undefined);
        await store.refresh();
        router.replace('/');
        return;
      }
      const result = await wallet.createWallet({
        password,
        ...(mode === 'importPhrase' ? { mnemonic: phrase } : {}),
      });
      if (mode === 'importPhrase') {
        const restored = await store.refresh();
        await restoreRememberedNames(wallet, restored.accounts).catch(() => undefined);
        await store.refresh();
        router.replace('/');
        return;
      }
      const created = await store.refresh();
      const address = created.accounts[0]?.address;
      if (address && networkId === 'mainnet') {
        recordPlatformEvent('wallet_created', networkId, address);
      }
      onCreated(result.mnemonic);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the wallet.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <BackLink label="← Back" onPress={onBack} />
      <Title>
        {mode === 'create'
          ? 'Choose a password'
          : mode === 'importPhrase'
            ? 'Restore your wallet'
            : 'Import a secret'}
      </Title>
      <Note>
        This password encrypts your keys on this phone. It is never sent anywhere, and it cannot be
        reset.
      </Note>
      <Text style={{ fontWeight: '700', color: colors.ink }}>Network</Text>
      <Note>Mainnet holds real funds. Testnet and Devnet are practice networks.</Note>
      {state.networks
        .filter(
          (network) =>
            network.id === 'mainnet' || network.id === 'testnet' || network.id === 'devnet',
        )
        .map((network) => (
          <Button
            key={network.id}
            label={`${networkId === network.id ? '✓ ' : ''}${network.isTest ? `${network.label} (test)` : network.label}`}
            variant={networkId === network.id ? 'accent' : 'ghost'}
            onPress={() => setNetworkId(network.id)}
          />
        ))}
      {mode === 'importPhrase' ? (
        <Field
          label="Recovery phrase"
          secret
          placeholder="Enter your 12 or 24 words, separated by spaces"
          value={phrase}
          onChangeText={setPhrase}
          hint="Words are matched exactly. Extra spaces and capitals are fine."
        />
      ) : null}
      {mode === 'importSecret' ? (
        <Field
          label="Family seed"
          secret
          placeholder="s… or sEd…"
          value={secret}
          onChangeText={setSecret}
          hint="A wallet imported this way holds one account and has no recovery phrase."
        />
      ) : null}
      <Field
        label="Password"
        secret
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          void wallet.assessPassword({ password: value }).then(setAssessment);
        }}
        hint={assessment?.warnings[0]}
      />
      <Field
        label="Confirm password"
        secret
        value={confirm}
        onChangeText={setConfirm}
        error={mismatch ? 'Passwords do not match.' : null}
      />
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Button label="Continue" disabled={!ready} loading={pending} onPress={() => void submit()} />
    </Screen>
  );
}

function BackupStep({
  phrase,
  onContinue,
}: {
  phrase: PhraseBox;
  onContinue: (challenge: Challenge) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  usePhrasePrivacy();
  const words = useRef<string[]>([]);
  const [, setTick] = useState(0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    words.current = (phrase.value ?? '').split(' ').filter(Boolean);
    setTick((value) => value + 1);
    return () => {
      words.current.fill('');
      words.current.length = 0;
    };
  }, [phrase]);

  return (
    <Screen>
      <Title>Write this down</Title>
      <Note>
        These 24 words restore your accounts on any wallet. Anyone who reads them can take your
        funds, so keep them off screens and out of cloud storage.
      </Note>
      <Callout tone="danger" title="Never type these into a website">
        No legitimate site, support agent, or airdrop will ever ask for your recovery phrase.
      </Callout>
      <View
        accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
      >
        {words.current.map((_, index) => (
          <View
            key={index}
            accessible={revealed}
            style={{
              flexBasis: '45%',
              minWidth: 120,
              flexGrow: 1,
              backgroundColor: colors.surface,
              borderRadius: 10,
              padding: 8,
            }}
          >
            <Text style={{ color: colors.faint, fontSize: 11 }}>{index + 1}</Text>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>
              {revealed ? words.current[index] : '••••'}
            </Text>
          </View>
        ))}
      </View>
      {revealed ? null : (
        <Button label="Reveal phrase" variant="secondary" onPress={() => setRevealed(true)} />
      )}
      {revealed ? <Button label="Hide" variant="ghost" onPress={() => setRevealed(false)} /> : null}
      <Button
        label="I have written it down"
        disabled={!revealed}
        loading={pending}
        onPress={() => {
          setPending(true);
          void buildChallenge(words.current)
            .then((challenge) => {
              words.current.fill('');
              words.current.length = 0;
              phrase.value = null;
              setRevealed(false);
              onContinue(challenge);
            })
            .finally(() => setPending(false));
        }}
      />
    </Screen>
  );
}

function VerifyStep({ challenge, onBack }: { challenge: Challenge; onBack: () => void }) {
  const router = useRouter();
  const { wallet, store } = useWallet();
  usePhrasePrivacy();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Screen>
      <BackLink label="Show my phrase again" onPress={onBack} />
      <Title>Confirm your backup</Title>
      <Note>
        Type the words at these positions from the copy you just wrote down. Your phrase is no
        longer on this screen, so showing it again asks for your password.
      </Note>
      {challenge.positions.map((position) => (
        <Field
          key={position}
          label={`Word ${position + 1}`}
          secret
          value={answers[position] ?? ''}
          onChangeText={(value) => {
            setError(null);
            setAnswers((current) => ({ ...current, [position]: value }));
          }}
        />
      ))}
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Button
        label="Finish setup"
        loading={pending}
        onPress={() => {
          setPending(true);
          void (async () => {
            const given = await Promise.all(
              challenge.positions.map((position) =>
                digestWord(challenge.salt, (answers[position] ?? '').trim().toLowerCase()),
              ),
            );
            if (given.some((digest, index) => digest !== challenge.digests[index])) {
              setError('Those words do not match. Check your written copy and try again.');
              return;
            }
            await wallet.confirmBackup();
            await forgetChallenge();
            await store.refresh();
            router.replace('/');
          })().finally(() => setPending(false));
        }}
      />
    </Screen>
  );
}

function ResumeBackup({
  onRevealed,
  onBack,
}: {
  onRevealed: (mnemonic: string) => void;
  onBack?: () => void;
}) {
  const { wallet } = useWallet();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  usePhrasePrivacy();

  useEffect(() => {
    if (!onBack) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  return (
    <Screen>
      {onBack ? <BackLink label="← Back" onPress={onBack} /> : null}
      <Title>Finish backing up</Title>
      <Note>
        Your wallet is ready, but its recovery phrase has not been written down yet. Confirm your
        password to see it again.
      </Note>
      <Callout tone="caution" title="Nothing else can restore this wallet">
        If you lose access to this device before recording the phrase, the funds are gone.
      </Callout>
      <Field label="Password" secret value={password} onChangeText={setPassword} />
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Button
        label="Show my recovery phrase"
        disabled={password.length === 0}
        loading={pending}
        onPress={() => {
          setPending(true);
          void wallet
            .exportRecoveryPhrase({ password })
            .then((result) => {
              onRevealed(result.mnemonic);
              setPassword('');
            })
            .catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : 'Could not reveal the phrase.');
            })
            .finally(() => setPending(false));
        }}
      />
    </Screen>
  );
}
