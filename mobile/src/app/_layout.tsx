import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useWallet, WalletRoot } from '../wallet';
import { colors } from '../theme';

const WALLET_SURFACES = new Set(['(tabs)', 'send', 'receive', 'scan']);

export default function RootLayout() {
  return (
    <WalletRoot>
      <StatusBar style="dark" />
      <WalletNavigator />
    </WalletRoot>
  );
}

function WalletNavigator() {
  const { state } = useWallet();
  const segments = useSegments();
  const router = useRouter();
  const onWalletSurface = segments.some((segment) => WALLET_SURFACES.has(segment));
  const backupConfirmed = state.preferences.backupConfirmed;

  useEffect(() => {
    if (!onWalletSurface) return;
    if (state.status === 'locked') {
      router.replace('/unlock');
      return;
    }
    if (state.status !== 'unlocked' || !backupConfirmed) router.replace('/setup');
  }, [onWalletSurface, state.status, backupConfirmed, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
        animation: 'fade',
      }}
    />
  );
}
