import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ApprovalRequest } from '@ledgerly/core/shared';
import {
  App,
  Approval,
  WalletProvider,
  WalletStore,
  createWalletClient,
  useWalletState,
} from '@ledgerly/ui';
import { createRuntimeTransport } from './runtimeTransport';

function createWallet() {
  const transport = createRuntimeTransport();
  const wallet = createWalletClient(transport);
  return { wallet, store: new WalletStore(wallet, transport) };
}

function Popup() {
  const { wallet, store } = useMemo(createWallet, []);
  const state = useWalletState(store);
  const [error, setError] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    store.refresh().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not start the wallet.');
    });
  }, [store]);

  // A site request takes over the window until the person answers it.
  const pending = state?.pendingApprovals ?? 0;
  useEffect(() => {
    let cancelled = false;
    if (pending === 0) {
      setApproval(null);
      return;
    }
    void wallet
      .listApprovals()
      .then((requests) => {
        if (cancelled) return;
        setApproval(requests[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setApproval(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pending, wallet]);

  // Absorbs stray clicks that were already on their way when the screen appeared.
  useEffect(() => {
    if (!approval) return;
    setInteractive(false);
    const timer = setTimeout(() => setInteractive(true), 400);
    return () => clearTimeout(timer);
  }, [approval]);

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
        surface: 'popup',
        openExternal: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
      }}
    >
      {approval ? (
        <div className="shell shell--popup">
          <div className="body body--narrow">
            <Approval
              request={approval}
              interactive={interactive}
              onResolved={() => {
                setApproval(null);
                void store.refresh();
              }}
            />
          </div>
        </div>
      ) : (
        <App surface="popup" />
      )}
    </WalletProvider>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<Popup />);
