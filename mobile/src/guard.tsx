import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useWallet } from './wallet';

/** Keeps the tab screens unmounted until the vault is unlocked. */
export function UnlockedOnly({ children }: { children: ReactNode }) {
  const { state } = useWallet();
  if (state.status === 'locked') return <Redirect href="/unlock" />;
  if (state.status !== 'unlocked' || !state.preferences.backupConfirmed) {
    return <Redirect href="/setup" />;
  }
  return children;
}
