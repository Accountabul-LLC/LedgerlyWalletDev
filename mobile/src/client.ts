import type { RpcEvent, WalletApi, WalletState } from '@ledgerly/core/shared';
import type { MobileTransport } from './runtime';

export function createWalletClient(transport: MobileTransport): WalletApi {
  const cache = new Map<string, (params?: unknown) => Promise<unknown>>();
  return new Proxy({} as WalletApi, {
    get(_target, property) {
      if (typeof property !== 'string') return undefined;
      let method = cache.get(property);
      if (!method) {
        method = (params?: unknown) => transport.request(property, params);
        cache.set(property, method);
      }
      return method;
    },
  });
}

export class WalletStore {
  private refreshGeneration = 0;
  private snapshot: WalletState | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly wallet: WalletApi,
    transport: MobileTransport,
  ) {
    transport.subscribe((event: RpcEvent) => {
      if (event.event === 'stateChanged') void this.refresh().catch(() => undefined);
    });
  }

  getSnapshot = (): WalletState | null => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Hide unlocked UI state immediately, without waiting for engine/network cleanup. */
  lockSnapshot(): void {
    this.refreshGeneration++;
    if (!this.snapshot) return;
    this.snapshot = {
      ...this.snapshot,
      status: this.snapshot.status === 'uninitialized' ? 'uninitialized' : 'locked',
      accounts: [],
      activeAccountId: null,
      sessionExpiresAt: null,
    };
    for (const listener of this.listeners) listener();
  }

  async refresh(): Promise<WalletState> {
    const generation = ++this.refreshGeneration;
    const state = await this.wallet.getState();
    if (generation !== this.refreshGeneration) return this.snapshot ?? state;
    this.snapshot = state;
    for (const listener of this.listeners) listener();
    return state;
  }
}
