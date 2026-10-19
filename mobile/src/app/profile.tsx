import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../supabase';
import { fetchWatchAccounts, sumXrp, type WatchAccount } from '../../../src/ledgerly/ui/watch';
import { BrandMark, Button, Callout, Card, Note, Row, Screen, Title } from '../ui';
import { colors } from '../theme';
import { shortenAddress } from '@ledgerly/core/shared';
import { useWallet } from '../wallet';
import { signOutAndLock } from '../../../src/ledgerly/native/signout';
import { IconBadge } from '../icons';
import { MarketPreview } from '../market-ui';

export default function ProfileScreen() {
  const router = useRouter();
  const { wallet, store } = useWallet();
  const [accounts, setAccounts] = useState<WatchAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/sign-in');
        return;
      }
      setEmail(sessionData.session.user.email ?? null);
      const { data, error: labelError } = await supabase
        .from('wallet_labels')
        .select('address, name, provider')
        .is('removed_at', null)
        .order('created_at', { ascending: true });
      if (labelError) throw new Error(labelError.message);
      const entries = (data ?? []).map((row) => ({
        address: row.address as string,
        name: row.name as string,
      }));
      setAccounts(await fetchWatchAccounts(entries));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your wallets.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = accounts ? sumXrp(accounts) : '0';

  return (
    <Screen>
      <BrandMark />
      <Title>Watch only balances</Title>
      <Note>
        Live Mainnet balances for every wallet saved to {email ?? 'your profile'}. This screen never
        opens the vault, so spending is impossible here by construction.
      </Note>

      <Card>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Total XRP across your wallets</Text>
        <Text style={{ fontFamily: 'Georgia', fontSize: 32, color: colors.ink }}>
          {loading ? '…' : total} <Text style={{ fontSize: 16 }}>XRP</Text>
        </Text>
      </Card>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {(accounts ?? []).map((account) => (
        <Card key={account.address}>
          <Row
            leading={<IconBadge name="wallet" />}
            title={account.name}
            subtitle={shortenAddress(account.address, 8, 6)}
            value={account.error ? '—' : `${account.xrp} XRP`}
          />
          {account.error ? <Text style={{ color: colors.danger }}>{account.error}</Text> : null}
        </Card>
      ))}

      {!loading && accounts?.length === 0 ? (
        <Callout title="No wallets on this profile yet">
          Set up a wallet on this phone, or open Ledgerly on the device that already holds your keys
          and sign in with the same profile so names can sync.
        </Callout>
      ) : null}

      <Button label="Refresh" variant="secondary" onPress={() => void load()} />
      <MarketPreview />
      <Button label="Open this device's wallet" onPress={() => router.replace('/')} />
      <Pressable
        onPress={() => {
          void signOutAndLock(wallet, store, () => supabase.auth.signOut())
            .then(() => router.replace('/sign-in'))
            .catch(() => setError('Could not sign out. Your wallet is locked.'));
        }}
      >
        <Text style={{ color: colors.muted, textAlign: 'center' }}>Sign out of profile</Text>
      </Pressable>
      <Link href="/" style={{ color: colors.purple, textAlign: 'center' }}>
        Back
      </Link>
    </Screen>
  );
}
