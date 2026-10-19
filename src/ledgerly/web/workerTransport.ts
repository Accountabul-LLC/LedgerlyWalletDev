import type { RpcEvent, RpcResponse } from '@ledgerly/core';
import type { Transport } from '@ledgerly/ui';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/** Bridges the page to the worker that owns the engine. */
export function createWorkerTransport(worker: Worker): Transport {
  let nextId = 0;
  const pending = new Map<string, Pending>();
  const listeners = new Set<(event: RpcEvent) => void>();

  worker.addEventListener('message', (event: MessageEvent<RpcResponse | RpcEvent>) => {
    const message = event.data;
    if ('event' in message) {
      for (const listener of listeners) listener(message);
      return;
    }
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.ok) {
      call.resolve(message.result);
    } else {
      const error = new Error(message.error.message);
      error.name = message.error.code;
      call.reject(error);
    }
  });

  worker.addEventListener('error', () => {
    for (const call of pending.values()) {
      call.reject(new Error('The wallet service stopped unexpectedly.'));
    }
    pending.clear();
  });

  return {
    request(method, params) {
      const id = String(nextId++);
      return new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, method, params });
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
