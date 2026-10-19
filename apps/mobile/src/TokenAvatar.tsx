import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { fetch } from 'expo/fetch';
import { marketIdentity } from '../../../src/ledgerly/native/market-data';
import { XrpSymbol } from './icons';
import { tokenLogoUrl } from './market';
import {
  createTokenLogoLoader,
  isFirstPartyMarketLogo,
  isPublicTokenIcon,
  tokenInitials,
} from './token-logo';
import { BRAND } from './brand';

const loadTokenLogo = createTokenLogoLoader((url, init) => fetch(url, init));
// Cream matches the Markets screen, so a cream disk disappears and only the
// initials remain. Line is darker than both that screen and the paper card.

function avatarLabel(currency: string, symbol?: string): string {
  const preferred = symbol?.trim();
  if (preferred) return preferred;
  if (/^[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}$/.test(currency)) return currency;
  return '';
}

export function TokenAvatar({
  currency,
  issuer,
  symbol,
  size = 44,
}: {
  currency: string;
  issuer: string | null;
  symbol?: string;
  size?: number;
}) {
  const native = currency === 'XRP' && issuer === null;
  const candidate = tokenLogoUrl(native ? null : marketIdentity(currency, issuer));
  const proxyUrl = isFirstPartyMarketLogo(candidate) ? candidate : null;
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [proxyBroken, setProxyBroken] = useState(false);

  useEffect(() => {
    setPublicUrl(null);
    setFailedUrl(null);
    setProxyBroken(false);
  }, [currency, issuer, proxyUrl]);

  useEffect(() => {
    if (native || (proxyUrl && !proxyBroken)) return;
    const controller = new AbortController();
    let alive = true;
    void loadTokenLogo(currency, issuer, controller.signal).then((url) => {
      if (alive) setPublicUrl(url);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [native, currency, issuer, proxyUrl, proxyBroken]);

  if (native) return <XrpSymbol size={size} />;

  const remote =
    proxyUrl && !proxyBroken && failedUrl !== proxyUrl
      ? proxyUrl
      : isPublicTokenIcon(publicUrl) && failedUrl !== publicUrl
        ? publicUrl
        : null;
  return (
    <View
      collapsable={false}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        pointerEvents="none"
        collapsable={false}
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: BRAND.line,
          borderWidth: 1,
          borderColor: BRAND.lineStrong,
        }}
      />
      <Text
        accessible={false}
        style={{
          color: BRAND.ink,
          fontSize: Math.max(12, Math.round(size * 0.32)),
          fontWeight: '700',
          textAlign: 'center',
          textAlignVertical: 'center',
          includeFontPadding: false,
          width: size,
        }}
      >
        {tokenInitials(avatarLabel(currency, symbol))}
      </Text>
      {remote ? (
        <Image
          source={{ uri: remote }}
          recyclingKey={remote}
          cachePolicy="memory-disk"
          contentFit="contain"
          transition={100}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
          onError={() => {
            setFailedUrl(remote);
            if (remote === proxyUrl) setProxyBroken(true);
          }}
          accessible={false}
        />
      ) : null}
    </View>
  );
}
