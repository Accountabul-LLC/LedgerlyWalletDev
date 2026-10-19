import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState, Linking, Text, View } from 'react-native';
import type { WalletApi, WalletState } from '@ledgerly/core/shared';
import { createWalletClient, WalletStore } from './client';
import { createMobileRuntime } from './runtime';
import { DeviceStore } from './storage';
import { colors } from './theme';
import { supabase } from './supabase';

interface WalletContextValue {
  readonly wallet: WalletApi;
  readonly store: WalletStore;
  readonly state: WalletState;
  readonly openExternal: (url: string) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function createHost() {
  const transport = createMobileRuntime(new DeviceStore());
  const wallet = createWalletClient(transport);
  return { wallet, transport, store: new WalletStore(wallet, transport) };
}

export function WalletRoot({ children }: { children: ReactNode }) {
  const { wallet, store, transport } = useMemo(createHost, []);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = (next: string) => {
      const active = next === 'active';
      setForeground(active);
      if (!active) store.lockSnapshot();
      void transport
        .setActive(active)
        .then(() => store.refresh())
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : 'Could not lock the wallet.');
        });
    };
    update(AppState.currentState);
    const subscription = AppState.addEventListener('change', update);
    return () => {
      subscription.remove();
      void transport.setActive(false).catch(() => undefined);
    };
  }, [store, transport]);

  useEffect(() => {
    store.refresh().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not start the wallet.');
    });
  }, [store]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      store.lockSnapshot();
      void wallet
        .lock()
        .then(() => store.refresh())
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : 'Could not lock the wallet.');
        });
    });
    return () => data.subscription.unsubscribe();
  }, [store, wallet]);

  // Unmount sensitive routes, clearing their phrase/password refs and state.
  if (!foreground) return <View style={{ flex: 1, backgroundColor: colors.cream }} />;

  if (error) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.cream, padding: 24, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.danger, fontSize: 16 }}>{error}</Text>
      </View>
    );
  }

  if (!state) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.cream, padding: 24, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.muted, fontSize: 16 }}>Starting Ledgerly…</Text>
      </View>
    );
  }

  return (
    <WalletContext.Provider
      value={{
        wallet,
        store,
        state,
        openExternal: (url) => {
          void Linking.openURL(url);
        },
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Accessor for the colocated provider.
export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside WalletRoot');
  return context;
}
