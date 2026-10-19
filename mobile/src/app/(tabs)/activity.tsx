import { useCallback, useEffect, useRef, useState } from 'react';
import { LatestRequest } from '../../../../src/ledgerly/native/latestRequest';
import { FlatList, Text, View } from 'react-native';
import { IconBadge } from '../../icons';
import type { HistoryEntry } from '@ledgerly/core/shared';
import { useWallet } from '../../wallet';
import {
  Button,
  Callout,
  Card,
  Note,
  Row,
  Screen,
  ScreenFrame,
  Title,
  useLayoutInsets,
} from '../../ui';
import { explorerTxUrl, formatRelativeTime } from '../../format';
import { colors } from '../../theme';

export default function ActivityScreen() {
  const insets = useLayoutInsets();
  const { wallet, state, openExternal } = useWallet();
  const accountId = state.activeAccountId;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [marker, setMarker] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scope = `${state.network.id}:${accountId ?? ''}`;
  const requests = useRef(new LatestRequest()).current;
  requests.setScope(scope);
  const [loadedScope, setLoadedScope] = useState('');

  const load = useCallback(
    async (cursor: unknown, replace: boolean) => {
      if (!accountId) return;
      const current = requests.begin();
      setLoading(true);
      setError(null);
      try {
        const page = await wallet.getHistory({
          accountId,
          ...(cursor === undefined ? {} : { marker: cursor }),
        });
        if (!current()) return;
        setLoadedScope(scope);
        setEntries((current) => [
          ...new Map(
            (replace ? page.entries : [...current, ...page.entries]).map((entry) => [
              entry.hash,
              entry,
            ]),
          ).values(),
        ]);
        setMarker(page.marker);
      } catch (caught) {
        if (current())
          setError(caught instanceof Error ? caught.message : 'Could not load activity.');
      } finally {
        if (current()) setLoading(false);
      }
    },
    [accountId, wallet, scope, requests],
  );

  useEffect(() => {
    setEntries([]);
    setMarker(undefined);
    void load(undefined, true);
    return () => requests.invalidate();
  }, [load, requests]);

  if (!accountId) {
    return (
      <Screen>
        <Title>Activity</Title>
        <Note>No account selected.</Note>
      </Screen>
    );
  }

  return (
    <ScreenFrame>
      <FlatList
        data={loadedScope === scope ? entries : []}
        keyExtractor={(entry) => entry.hash}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerStyle={{ padding: 20, paddingBottom: 48 + insets.bottom, gap: 14 }}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <Title>Activity</Title>
            <Note>Payments and other ledger entries for this wallet.</Note>
            {error ? <Callout tone="danger">{error}</Callout> : null}
          </View>
        }
        renderItem={({ item: entry }) => (
          <Card>
            <Row
              leading={
                <IconBadge
                  name={
                    entry.direction === 'in'
                      ? 'receive'
                      : entry.direction === 'out'
                        ? 'send'
                        : 'activity'
                  }
                />
              }
              title={entry.headline}
              subtitle={formatRelativeTime(entry.timestamp)}
              value={entry.amount ?? ''}
            />
            {!entry.succeeded ? <Text style={{ color: colors.danger }}>Failed</Text> : null}
            <Button
              label="View on explorer"
              variant="ghost"
              onPress={() => {
                const url = explorerTxUrl(state.network, entry.hash);
                if (url) openExternal(url);
              }}
            />
          </Card>
        )}
        ListEmptyComponent={
          !loading ? (
            <Callout title="Nothing yet">Payments you send and receive will show up here.</Callout>
          ) : (
            <Note>Loading activity…</Note>
          )
        }
        ListFooterComponent={
          marker ? (
            <Button
              label={loading ? 'Loading…' : 'Load more'}
              variant="secondary"
              disabled={loading}
              onPress={() => void load(marker, false)}
            />
          ) : null
        }
      />
    </ScreenFrame>
  );
}
