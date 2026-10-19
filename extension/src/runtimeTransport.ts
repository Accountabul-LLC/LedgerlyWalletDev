import type { RpcEvent } from '@ledgerly/core/shared';
import type { Transport } from '@ledgerly/ui';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/** Bridges an extension page to the service worker that owns the engine. */
export function createRuntimeTransport(): Transport {
  let nextId = 0;
  const listeners = new Set<(event: RpcEvent) => void>();

  chrome.runtime.onMessage.addListener((message) => {
    const event = message as RpcEvent | undefined;
    if (!event || typeof event !== 'object' || !('event' in event)) return;
    for (const listener of listeners) listener(event);
  });

  return {
    request(method, params) {
      const id = String(nextId++);
      return new Promise<unknown>((resolve, reject) => {
        const pending: Pending = { resolve, reject };
        chrome.runtime.sendMessage(
          { channel: 'wallet', request: { id, method, params } },
          (raw) => {
            const error = chrome.runtime.lastError;
            if (error) {
              pending.reject(new Error(error.message ?? 'The wallet service is not responding.'));
              return;
            }
            const response = raw as
              | { ok: true; result: unknown }
              | { ok: false; error: { code: string; message: string } }
              | undefined;
            if (!response) {
              pending.reject(new Error('The wallet service is not responding.'));
              return;
            }
            if (response.ok) {
              pending.resolve(response.result);
            } else {
              const failure = new Error(response.error.message);
              failure.name = response.error.code;
              pending.reject(failure);
            }
          },
        );
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
