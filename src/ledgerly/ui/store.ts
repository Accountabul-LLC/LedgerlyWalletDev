import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { WalletApi, WalletState } from '@ledgerly/core/shared';
import type { Transport } from './transport';
import { rememberNames } from './name-memory';

/**
 * The engine is the single source of truth. This store holds nothing but the
 * last snapshot it sent, so the interface can never disagree with the wallet
 * about whether it is locked or which accounts exist.
 */
export class WalletStore {
  private snapshot: WalletState | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly wallet: WalletApi,
    transport: Transport,
  ) {
    transport.subscribe((event) => {
      if (event.event === 'stateChanged') void this.refresh();
    });
  }

  getSnapshot = (): WalletState | null => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async refresh(): Promise<WalletState> {
    const state = await this.wallet.getState();
    // Names only, so a wallet removed from this device can come back with the
    // name it had. Nothing secret is in the snapshot's account list.
    rememberNames(
      state.accounts.map((account) => ({ address: account.address, label: account.label })),
    );
    this.snapshot = state;
    for (const listener of this.listeners) listener();
    return state;
  }
}

export function useWalletState(store: WalletStore): WalletState | null {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export interface AsyncAction<TArgs extends unknown[]> {
  run: (...args: TArgs) => Promise<void>;
  pending: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Runs an async wallet call while tracking its pending and error state, and
 * drops the result if the component unmounted in the meantime.
 */
export function useAsyncAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<unknown>,
): AsyncAction<TArgs> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setError(null);
      try {
        await action(...args);
      } catch (caught) {
        if (mounted.current) {
          setError(caught instanceof Error ? caught.message : 'Something went wrong.');
        }
        throw caught;
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error, clearError: useCallback(() => setError(null), []) };
}

/** Fetches on mount and whenever a dependency changes, ignoring stale responses. */
export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const depsKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    // When the inputs change (a different account or network), the previous
    // result belongs to something else, so it is dropped rather than shown
    // stale while the new request is in flight. A manual reload keeps its data.
    const key = JSON.stringify(deps);
    if (depsKey.current !== null && depsKey.current !== key) {
      setData(null);
      setError(null);
    }
    depsKey.current = key;
    setLoading(true);

    load()
      .then((value) => {
        if (!active) return;
        setData(value);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Could not load.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading, reload: useCallback(() => setNonce((n) => n + 1), []) };
}
