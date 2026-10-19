import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useWallet } from '../wallet';
import { BrandMark, Button, Callout, Field, Note, Screen, Title } from '../ui';
import { formatDuration } from '../format';
import { colors } from '../theme';

export default function UnlockScreen() {
  const router = useRouter();
  const { wallet, store, state } = useWallet();
  const [password, setPassword] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [startFresh, setStartFresh] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');

  const lockoutUntil = state.lockoutUntil;

  useEffect(() => {
    if (!lockoutUntil) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const left = lockoutUntil - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) void store.refresh();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil, store]);

  const throttled = remaining > 0;

  return (
    <Screen>
      <BrandMark />
      <Title>Welcome back</Title>
      <Note>Enter your password to unlock this wallet.</Note>

      <Field
        label="Password"
        secret
        editable={!throttled}
        value={password}
        onChangeText={setPassword}
      />

      {throttled ? (
        <Callout tone="caution" title="Too many attempts">
          Unlocking is paused for {formatDuration(remaining)}. This delay grows with each wrong
          password.
        </Callout>
      ) : null}
      {error && !throttled ? <Callout tone="danger">{error}</Callout> : null}

      <Button
        label="Unlock"
        disabled={password.length === 0 || throttled}
        loading={pending}
        onPress={() => {
          setPending(true);
          setError(null);
          // Paint the progress state before derivation starts. The JavaScript
          // fallback occupies this thread; the native module does not.
          setTimeout(() => {
            void wallet
              .unlock({ password })
              .then(async () => {
                setPassword('');
                await store.refresh();
                router.replace('/');
              })
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Could not unlock.');
              })
              .finally(() => setPending(false));
          }, 0);
        }}
      />
      {pending ? (
        <Note>
          Unlocking on this phone. The password check uses the same Argon2id cost stored with this
          wallet.
        </Note>
      ) : null}

      <Callout tone="info" title="New device?">
        Wallets live on the phone you created them on. Names and contacts can follow a signed-in
        profile; keys never do. Restore with your recovery phrase to send from this device.
      </Callout>
      <Link
        href="/profile"
        style={{ color: colors.purple, textAlign: 'center', fontWeight: '600' }}
      >
        See your balances without unlocking
      </Link>

      {startFresh ? (
        <>
          <Callout tone="danger" title="This cannot be undone">
            Clearing this wallet deletes the encrypted vault on this phone. The ledger is untouched.
            Only your recovery phrase can bring the keys back.
          </Callout>
          <Field
            label="Type ERASE to confirm"
            value={confirmPhrase}
            autoCapitalize="characters"
            onChangeText={setConfirmPhrase}
          />
          <Button
            label="Erase this device wallet"
            variant="danger"
            disabled={confirmPhrase !== 'ERASE'}
            onPress={() => {
              void wallet
                .resetWallet({ confirmation: 'ERASE' })
                .then(() => store.refresh())
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error ? caught.message : 'Could not erase the wallet.',
                  ),
                );
            }}
          />
        </>
      ) : (
        <Button
          label="Clear this wallet and start over"
          variant="ghost"
          onPress={() => setStartFresh(true)}
        />
      )}
      <Text style={{ color: colors.faint, textAlign: 'center', fontSize: 13 }}>
        Forgotten your password? Only this wallet's recovery phrase can restore it.
      </Text>
    </Screen>
  );
}
