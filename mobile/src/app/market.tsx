import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMarket } from '../market';
import { MarketAssetRow, MarketCredit } from '../market-ui';
import { Button, Callout, Note, ScreenFrame, Title, useLayoutInsets } from '../ui';
import { Icon } from '../icons';
import { colors } from '../theme';

export default function MarketScreen() {
  const { snapshot, saved, error, loading, refresh } = useMarket();
  const router = useRouter();
  const insets = useLayoutInsets();
  return (
    <ScreenFrame>
      <View style={{ gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Icon name="arrow-left" />
        </Pressable>
        <Title>XRPL markets</Title>
        <Note>Mainnet token prices in USD · 24-hour change</Note>
        <MarketCredit />
      </View>
      <FlatList
        data={snapshot?.assets ?? []}
        keyExtractor={(asset) => asset.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 + insets.bottom }}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        refreshing={loading}
        onRefresh={() => void refresh()}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingTop: 16, paddingBottom: 16 }}>
            {snapshot ? (
              <Note>
                {saved ? 'Saved prices' : 'Latest available prices'} · last checked{' '}
                {new Date(snapshot.fetchedAt).toLocaleTimeString()}
              </Note>
            ) : null}
            {error ? (
              <Callout>
                {snapshot
                  ? 'You are viewing saved prices. Refresh when you are back online.'
                  : error}
              </Callout>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <MarketAssetRow asset={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.line }} />}
        ListEmptyComponent={
          <Note>
            {loading ? 'Loading market prices…' : 'No market prices available right now.'}
          </Note>
        }
        ListFooterComponent={
          <View style={{ paddingTop: 20, gap: 12 }}>
            <Button
              label={loading ? 'Updating…' : 'Refresh prices'}
              variant="secondary"
              disabled={loading}
              onPress={() => void refresh()}
            />
            <Note>
              Market prices are separate from your wallet balances. A listing is not an endorsement.
            </Note>
          </View>
        }
      />
    </ScreenFrame>
  );
}
