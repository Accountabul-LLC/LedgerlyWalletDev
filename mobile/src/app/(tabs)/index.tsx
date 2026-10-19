import { useCallback, useEffect, useRef, useState } from 'react';
import { LatestRequest } from '../../../../src/ledgerly/native/latestRequest';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addDrops, dropsToXrp, formatAmount, shortenAddress } from '@ledgerly/core/shared';
import type { Portfolio } from '@ledgerly/core/shared';
import { useWallet } from '../../wallet';
import { BrandMark, Button, Callout, Card, Note, Row, Screen, Title } from '../../ui';
import { colors } from '../../theme';
import { XRPL_DOCS } from '../../theme';
import { MarketPreview } from '../../market-ui';
import { IconBadge } from '../../icons';
import { recordWalletActivated } from '../../activity';

export default function HomeScreen() {
  const router = useRouter();
  const { wallet, state, store, openExternal } = useWallet();
  const hidden = state.preferences.hideBalances;
  const [result, setResult] = useState<{
    scope: string;
    rows: { accountId: string; portfolio: Portfolio | null }[];
  } | null>(null);
  const accountIds = state.accounts.map((account) => account.id).join(',');
  const scope = `${state.network.id}:${accountIds}`;
  const requests = useRef(new LatestRequest()).current;
  requests.setScope(scope);
  const rows = result?.scope === scope ? result.rows : [];
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (refresh = false) => {
      const current = requests.begin();
      setLoading(true);
      setError(null);
      try {
        const ids = accountIds ? accountIds.split(',') : [];
        const results = await Promise.allSettled(
          ids.map((accountId) => wallet.getPortfolio({ accountId, refresh })),
        );
        if (current()) {
          const failure = results.find((result) => result.status === 'rejected');
          setResult({
            scope,
            rows: results.map((result, index) => ({
              accountId: ids[index] ?? '',
              portfolio: result.status === 'fulfilled' ? result.value : null,
            })),
          });
          if (failure?.status === 'rejected') {
            setError(
              failure.reason instanceof Error ? failure.reason.message : 'Could not load balances.',
            );
          }
        }
      } catch (caught) {
        if (current())
          setError(caught instanceof Error ? caught.message : 'Could not load balances.');
      } finally {
        if (current()) setLoading(false);
      }
    },
    [accountIds, scope, wallet, requests],
  );

  useEffect(() => {
    void load();
    return () => requests.invalidate();
  }, [load, requests]);

  const totalDrops = rows.reduce(
    (sum, row) => (row.portfolio ? addDrops(sum, row.portfolio.summary.balanceDrops) : sum),
    '0',
  );
  const pending = loading || result?.scope !== scope;
  const anyBalance = rows.some((row) => row.portfolio);
  const inactive = rows.filter((row) => row.portfolio && !row.portfolio.summary.exists);
  const activeAddresses = rows
    .flatMap((row) => (row.portfolio?.summary.exists ? [row.portfolio.summary.address] : []))
    .join(',');
  useEffect(() => {
    if (activeAddresses) recordWalletActivated(state.network.id, activeAddresses.split(','));
  }, [activeAddresses, state.network.id]);

  return (
    <Screen>
      <BrandMark />
      <Title>All wallets</Title>
      <Note>
        Combined total of your {state.accounts.length}{' '}
        {state.accounts.length === 1 ? 'wallet' : 'wallets'} on {state.network.label}.
      </Note>

      <Card>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{state.network.label}</Text>
        <Text style={{ fontFamily: 'Georgia', fontSize: 36, color: colors.ink }}>
          {pending
            ? '…'
            : hidden
              ? '••••'
              : !anyBalance && error
                ? '—'
                : formatAmount(dropsToXrp(totalDrops))}{' '}
          <Text style={{ fontSize: 18 }}>XRP</Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Send" onPress={() => router.push('/send')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Receive" variant="secondary" onPress={() => router.push('/receive')} />
          </View>
        </View>
      </Card>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {!state.network.isTest && inactive.length > 0 ? (
        <Callout tone="caution" title="Action needed">
          A wallet has to hold a small starting amount of XRP before it can receive anything on{' '}
          {state.network.label}.{' '}
          <Text style={{ color: colors.purple }} onPress={() => openExternal(XRPL_DOCS.reserves)}>
            Read about reserves
          </Text>
        </Callout>
      ) : null}

      {state.accounts.map((account) => {
        const portfolio = rows.find((row) => row.accountId === account.id)?.portfolio;
        return (
          <Pressable
            key={account.id}
            onPress={() => {
              void wallet.selectAccount({ accountId: account.id }).then(() => store.refresh());
            }}
          >
            <Card>
              <Row
                leading={<IconBadge name="wallet" />}
                title={account.label}
                subtitle={shortenAddress(account.address, 8, 6)}
                value={
                  hidden
                    ? '••••'
                    : portfolio
                      ? `${formatAmount(dropsToXrp(portfolio.summary.balanceDrops))} XRP`
                      : pending
                        ? '…'
                        : '—'
                }
              />
              {portfolio && !portfolio.summary.exists ? (
                <Text style={{ color: colors.caution }}>Waiting for first funds</Text>
              ) : null}
            </Card>
          </Pressable>
        );
      })}

      <Button label="Refresh" variant="ghost" onPress={() => void load(true)} />
      <MarketPreview />
      <Pressable
        onPress={() => {
          void wallet
            .setPreferences({ hideBalances: !state.preferences.hideBalances })
            .then(() => store.refresh());
        }}
      >
        <Text style={{ color: colors.muted, textAlign: 'center' }}>
          {hidden ? 'Show balances' : 'Hide balances'}
        </Text>
      </Pressable>
    </Screen>
  );
}
