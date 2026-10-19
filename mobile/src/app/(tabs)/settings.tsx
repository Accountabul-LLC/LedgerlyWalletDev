import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { shortenAddress } from '@ledgerly/core/shared';
import { useWallet } from '../../wallet';
import { Button, Callout, Card, Field, Note, Row, Screen, Title } from '../../ui';
import { supabase } from '../../supabase';
import { pushWalletLabels } from '../../sync';
import { colors } from '../../theme';
import { signOutAndLock } from '../../../../src/ledgerly/native/signout';
import { IconBadge } from '../../icons';

export default function SettingsScreen() {
  const router = useRouter();
  const { wallet, store, state } = useWallet();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let current = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (current) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      current = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <Screen>
      <Title>Settings</Title>
      <Note>This phone holds the encrypted vault. Your profile is only names and payees.</Note>

      <Card>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Wallets on this device</Text>
        {state.accounts.map((account) => (
          <Row
            key={account.id}
            leading={<IconBadge name="wallet" />}
            title={account.label}
            subtitle={shortenAddress(account.address, 8, 6)}
          />
        ))}
        <Button
          label="Use selected wallet for send"
          variant="secondary"
          onPress={() => router.push('/send')}
        />
      </Card>

      <Card>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Network</Text>
        {state.networks
          .filter((network) => state.preferences.showTestNetworks || !network.isTest)
          .map((network) => (
            <Button
              key={network.id}
              icon="network"
              label={network.id === state.network.id ? `✓ ${network.label}` : network.label}
              variant={network.id === state.network.id ? 'accent' : 'ghost'}
              onPress={() => {
                void wallet.setNetwork({ networkId: network.id }).then(() => store.refresh());
              }}
            />
          ))}
      </Card>

      <Card>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Change password</Text>
        <Field label="Current password" secret value={current} onChangeText={setCurrent} />
        <Field label="New password" secret value={next} onChangeText={setNext} />
        <Field label="Confirm new password" secret value={confirm} onChangeText={setConfirm} />
        {error ? <Callout tone="danger">{error}</Callout> : null}
        {notice ? <Callout tone="positive">{notice}</Callout> : null}
        <Button
          label="Update password"
          disabled={current.length === 0 || next.length === 0 || next !== confirm}
          loading={pending}
          onPress={() => {
            setPending(true);
            setError(null);
            setNotice(null);
            void wallet
              .changePassword({ current, next })
              .then(() => {
                setCurrent('');
                setNext('');
                setConfirm('');
                setNotice('Password updated on this device.');
              })
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Could not change password.');
              })
              .finally(() => setPending(false));
          }}
        />
      </Card>

      <Button
        label="Lock wallet"
        variant="secondary"
        onPress={() => {
          store.lockSnapshot();
          void wallet
            .lock()
            .then(() => store.refresh())
            .then(() => {
              router.replace('/unlock');
            })
            .catch(() => {
              void store.refresh();
              setError('Could not lock the wallet.');
            });
        }}
      />
      {signedIn ? (
        <>
          <Button
            label="Sync names to my profile"
            variant="secondary"
            onPress={() => {
              void pushWalletLabels(wallet, state.accounts)
                .then(() => setNotice('Names and payees saved to your profile.'))
                .catch((caught: unknown) => {
                  setError(
                    caught instanceof Error ? caught.message : 'Sign in to a profile first.',
                  );
                });
            }}
          />
          <Button
            label="Sign out of profile"
            variant="ghost"
            onPress={() => {
              store.lockSnapshot();
              void signOutAndLock(wallet, store, () => supabase.auth.signOut())
                .then(() => {
                  router.replace('/unlock');
                })
                .catch(() => setError('Could not sign out. Your wallet is locked.'));
            }}
          />
        </>
      ) : null}
      <Button label="Watch-only profile" variant="ghost" onPress={() => router.push('/profile')} />

      {resetArmed ? (
        <Callout tone="danger" title="Erase this device wallet?">
          This deletes the encrypted vault on this phone. The XRPL accounts keep their balances.
          Only the recovery phrase can restore the keys.
        </Callout>
      ) : null}
      <Button
        label={resetArmed ? 'Yes, erase this device' : 'Erase wallet on this phone'}
        variant="danger"
        onPress={() => {
          if (!resetArmed) {
            setResetArmed(true);
            return;
          }
          void wallet
            .resetWallet({ confirmation: 'ERASE' })
            .then(() => store.refresh())
            .catch(() => setError('Could not erase this device wallet.'));
        }}
      />
    </Screen>
  );
}
