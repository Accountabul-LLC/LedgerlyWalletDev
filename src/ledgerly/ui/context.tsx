import { createContext, useContext, type ReactNode } from 'react';
import type { WalletApi, WalletState } from '@ledgerly/core/shared';
import type { WalletStore } from './store';

export type Surface = 'popup' | 'web';

interface WalletContextValue {
  readonly wallet: WalletApi;
  readonly store: WalletStore;
  readonly state: WalletState;
  readonly surface: Surface;
  /** Opens a URL in a way that suits the host; the popup cannot navigate itself away. */
  readonly openExternal: (url: string) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({
  value,
  children,
}: {
  value: WalletContextValue;
  children: ReactNode;
}) {
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside WalletProvider');
  return context;
}
