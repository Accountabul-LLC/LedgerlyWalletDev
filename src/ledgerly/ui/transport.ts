import type { RpcEvent, WalletApi } from '@ledgerly/core/shared';

/**
 * The channel between the interface and the engine.
 *
 * The interface never imports the engine directly. Both hosts put a process
 * boundary in between — an extension service worker, or a dedicated web worker —
 * so a bug in a React component cannot reach a private key even in principle.
 */
export interface Transport {
  request(method: string, params?: unknown): Promise<unknown>;
  subscribe(listener: (event: RpcEvent) => void): () => void;
}

export class WalletError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'wallet_error',
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

/**
 * Wraps a transport in the `WalletApi` shape so views call `wallet.unlock(...)`
 * and get the real signature checked at compile time.
 */
export function createWalletClient(transport: Transport): WalletApi {
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
