import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MarketAsset } from '../../../src/ledgerly/native/market-data';
import { MARKET_ATTRIBUTION, MARKET_PROVIDER_URL } from '../../../src/ledgerly/native/market-data';
import { BRAND } from './brand';
import { Icon } from './icons';
import { TokenAvatar } from './TokenAvatar';
import { useMarket } from './market';
import { marketPrice } from './market-format';

function AssetQuote({ asset }: { asset: MarketAsset }) {
  const change = asset.change24h;
  return (
    <View style={styles.row}>
      <TokenAvatar currency={asset.currency} issuer={asset.issuer} symbol={asset.ticker} />
      <View style={styles.identity}>
        <Text numberOfLines={1} style={styles.ticker}>
          {asset.ticker}
        </Text>
        <Text numberOfLines={1} style={styles.subtle}>
          {asset.issuer ? `${asset.issuer.slice(0, 6)}…${asset.issuer.slice(-4)}` : 'Native XRP'}
        </Text>
      </View>
      <View style={styles.quote}>
        <Text style={styles.price}>{marketPrice(asset.priceUsd)}</Text>
        <Text style={[styles.change, change !== null && change < 0 && styles.negative]}>
          {change === null
            ? '24h unavailable'
            : `${change > 0 ? '+' : ''}${change.toFixed(2)}% · 24h`}
        </Text>
      </View>
    </View>
  );
}

/** Public mainnet quotes are independent of profile, wallet network and private balances. */
export function MarketPanel({
  expanded = false,
  onExplore,
}: {
  expanded?: boolean;
  onExplore?: () => void;
}) {
  const { snapshot, saved, loading, error, refresh } = useMarket();
  const assets = snapshot?.assets ?? [];
  const header = (
    <View style={styles.header}>
      <View style={styles.heading}>
        <View style={styles.identity}>
          <Text style={styles.title}>XRPL markets</Text>
          <Text style={styles.subtle}>Mainnet prices · USD</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh market prices"
          disabled={loading}
          onPress={() => void refresh()}
          style={styles.refresh}
        >
          <Text style={styles.subtle}>{loading ? 'Loading…' : 'Refresh'}</Text>
        </Pressable>
      </View>
      {snapshot ? (
        <Text style={styles.subtle}>
          {saved ? 'Saved prices' : 'Last checked'} ·{' '}
          {new Date(snapshot.fetchedAt).toLocaleTimeString()}
          {' · '}
          <Text
            accessibilityRole="link"
            accessibilityLabel={MARKET_ATTRIBUTION}
            onPress={() => void Linking.openURL(MARKET_PROVIDER_URL).catch(() => undefined)}
            style={styles.subtle}
          >
            {MARKET_ATTRIBUTION}
          </Text>
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.subtle}>
          {error}
        </Text>
      ) : null}
      {!assets.length ? (
        <Text style={styles.subtle}>
          {loading ? 'Loading prices…' : 'Prices unavailable. Your wallet remains available.'}
        </Text>
      ) : null}
    </View>
  );
  if (expanded)
    return (
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={assets}
        keyExtractor={assetKey}
        renderItem={renderAsset}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        ListHeaderComponent={header}
      />
    );
  return (
    <View style={styles.card}>
      {header}
      {assets.slice(0, 5).map((asset) => (
        <AssetQuote key={asset.id} asset={asset} />
      ))}
      <Pressable accessibilityRole="button" onPress={onExplore} style={styles.explore}>
        <Text style={styles.ticker}>Explore markets</Text>
        <Icon name="arrow-right" size={20} />
      </Pressable>
    </View>
  );
}
const assetKey = (asset: MarketAsset) => asset.id;
const renderAsset = ({ item }: { item: MarketAsset }) => <AssetQuote asset={item} />;
const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.paper, borderRadius: 18, padding: 16 },
  list: { flex: 1 },
  listContent: { padding: 20 },
  header: { gap: 8, marginBottom: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 21, fontWeight: '700', color: BRAND.ink },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    minHeight: 76,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.line,
  },
  identity: { flex: 1, minWidth: 0 },
  quote: { alignItems: 'flex-end', flexShrink: 1 },
  ticker: { color: BRAND.ink, fontSize: 16, fontWeight: '700' },
  price: { color: BRAND.ink, fontSize: 15, fontWeight: '600' },
  subtle: { color: BRAND.muted, fontSize: 12, lineHeight: 18 },
  change: { color: '#32734C', fontSize: 12, marginTop: 4 },
  negative: { color: BRAND.danger },
  refresh: { padding: 10 },
  explore: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    minHeight: 48,
  },
});
