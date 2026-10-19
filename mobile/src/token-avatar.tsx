import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { marketIdentity } from '../../src/ledgerly/native/market-data';
import { Icon, XrpSymbol } from './icons';
import { tokenLogoUrl } from './market';
import { colors } from './theme';

export function TokenAvatar({
  currency,
  issuer,
  size = 44,
}: {
  currency: string;
  issuer: string | null;
  size?: number;
}) {
  const identity = marketIdentity(currency, issuer);
  const url = tokenLogoUrl(identity);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [url]);
  if (currency === 'XRP' && issuer === null) return <XrpSymbol size={size} />;
  const load = url && failedUrl !== url;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.sunken,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {load ? (
        <Image
          source={{ uri: url }}
          recyclingKey={identity ?? ''}
          cachePolicy="memory-disk"
          contentFit="contain"
          transition={100}
          style={{ width: size, height: size }}
          onError={() => setFailedUrl(url)}
          accessible={false}
        />
      ) : (
        <Icon name="coins" size={22} color={colors.muted} />
      )}
    </View>
  );
}
