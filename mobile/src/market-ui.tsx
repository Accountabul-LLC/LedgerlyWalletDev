import { memo } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { MarketAsset } from '../../src/ledgerly/native/market-data';
import { MARKET_ATTRIBUTION, MARKET_PROVIDER_URL } from '../../src/ledgerly/native/market-data';
import { useMarket } from './market';
import { TokenAvatar } from './token-avatar';
import { Button, Callout, Card, Note } from './ui';
import { colors } from './theme';
import { marketPrice } from './market-format';

export const MarketAssetRow = memo(function MarketAssetRow({ asset }: { asset: MarketAsset }) {
  const change = asset.change24h;
  const changeLabel = change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
  return (
    <View
      style={{ height: 84, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      accessible
      accessibilityLabel={`${asset.ticker}, ${asset.name}, ${asset.issuer ?? 'native XRP'}, ${marketPrice(asset.priceUsd)}, 24 hour ${changeLabel}`}
    >
      <TokenAvatar currency={asset.currency} issuer={asset.issuer} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>
          {asset.ticker}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
          {asset.name}
        </Text>
        {asset.issuer ? (
          <Text numberOfLines={1} style={{ color: colors.faint, fontSize: 10 }}>
            {asset.issuer.slice(0, 7)}…{asset.issuer.slice(-5)}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: '42%' }}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.ink,
            fontWeight: '600',
            fontSize: 15,
            fontVariant: ['tabular-nums'],
          }}
        >
          {marketPrice(asset.priceUsd)}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color:
              change === null || change === 0
                ? colors.muted
                : change > 0
                  ? colors.positive
                  : colors.danger,
            fontSize: 12,
            marginTop: 5,
          }}
        >
          {changeLabel}
        </Text>
      </View>
    </View>
  );
});

export function MarketCredit() {
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(MARKET_PROVIDER_URL)}>
      <Text style={{ color: colors.muted, fontSize: 12, textDecorationLine: 'underline' }}>
        {MARKET_ATTRIBUTION}
      </Text>
    </Pressable>
  );
}

export function MarketPreview() {
  const { snapshot, saved, loading, error } = useMarket();
  const router = useRouter();
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 19, fontWeight: '700', color: colors.ink }}>XRPL markets</Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>MAINNET · USD</Text>
      </View>
      {snapshot ? (
        snapshot.assets.slice(0, 5).map((asset) => <MarketAssetRow key={asset.id} asset={asset} />)
      ) : (
        <Note>{loading ? 'Loading market prices…' : 'Market prices are unavailable.'}</Note>
      )}
      {saved && snapshot ? (
        <Note>Saved prices · last checked {new Date(snapshot.fetchedAt).toLocaleTimeString()}</Note>
      ) : null}
      {error && !snapshot ? <Callout>{error}</Callout> : null}
      <MarketCredit />
      <Button label="Explore markets" variant="ghost" onPress={() => router.push('/market')} />
    </Card>
  );
}
