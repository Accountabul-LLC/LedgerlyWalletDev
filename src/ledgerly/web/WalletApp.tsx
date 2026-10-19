import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  App,
  WalletProvider,
  WalletStore,
  broadcastSession,
  createWalletClient,
  useWalletState,
} from '@ledgerly/ui';
import '@ledgerly/ui/styles.css';
import { createWorkerTransport } from './workerTransport';

function createWallet() {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'ledgerly-engine',
  });
  const transport = createWorkerTransport(worker);
  // Anything the engine writes here has to reach the other tabs, otherwise a
  // second tab keeps rendering the wallet set it read when it opened.
  transport.subscribe((event) => {
    if (event.event === 'stateChanged') broadcastSession('vaultChanged');
  });
  const wallet = createWalletClient(transport);
  return { wallet, store: new WalletStore(wallet, transport) };
}

export default function WalletApp({
  tab,
  onTabChange,
  onGateChange,
  children,
}: {
  tab?: 'home' | 'tokens' | 'activity' | 'contacts' | 'settings';
  onTabChange?: (tab: 'home' | 'tokens' | 'activity' | 'contacts' | 'settings') => void;
  onGateChange?: (gate: 'setup' | 'locked' | null) => void;
  children?: ReactNode;
} = {}) {
  const { wallet, store } = useMemo(createWallet, []);
  const state = useWalletState(store);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    store.refresh().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not start the wallet.');
    });
  }, [store]);

  // The session lives only in the worker, so leaving the page ends it outright.
  useEffect(() => {
    const lockOnExit = () => {
      void wallet.lock();
    };
    window.addEventListener('pagehide', lockOnExit);
    return () => window.removeEventListener('pagehide', lockOnExit);
  }, [wallet]);

  if (error) {
    return (
      <div className="body">
        <div className="callout callout--danger">{error}</div>
      </div>
    );
  }

  if (!state) return <div className="empty">Starting Ledgerly…</div>;

  return (
    <WalletProvider
      value={{
        wallet,
        store,
        state,
        surface: 'web',
        openExternal: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
      }}
    >
      <App surface="web" tab={tab} onTabChange={onTabChange} onGateChange={onGateChange}>
        {children}
      </App>
    </WalletProvider>
  );
}
