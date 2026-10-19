/// <reference lib="webworker" />
import {
  MemorySessionStore,
  WalletEngine,
  isWalletMethod,
  type RpcRequest,
  type RpcResponse,
} from '@ledgerly/core';
import { IndexedDbStore } from './storage';

declare const self: DedicatedWorkerGlobalScope;

/**
 * The wallet engine for the web app, isolated in a dedicated worker.
 *
 * Nothing on the page's thread — no React component, no third-party script that
 * ever lands on the page, no browser extension injecting into the DOM — shares
 * a heap with the decrypted keys. The only way in is the message channel below,
 * which exposes exactly the methods on the allowlist.
 *
 * The session lives in worker memory alone. A reload discards it and the
 * password is required again; on the open web that is the right trade, because
 * there is no equivalent of the extension's memory-only session storage that a
 * page script could not eventually reach.
 */
const engine = new WalletEngine({
  store: new IndexedDbStore(),
  session: new MemorySessionStore(),
  version: '1.0.0',
  onStateChanged: () => {
    self.postMessage({ event: 'stateChanged', payload: null });
  },
  onApprovalRequested: () => {
    self.postMessage({ event: 'stateChanged', payload: null });
  },
});

const ready = engine.start();

/**
 * The web build has no dApp provider — there is no content script and no page to
 * grant permissions to — so the provider surface is simply never wired up here.
 * The privileged allowlist is the shared one, so it cannot drift from the
 * extension's.
 */

self.addEventListener('message', (event: MessageEvent<RpcRequest>) => {
  const request = event.data;
  if (typeof request?.method !== 'string' || typeof request.id !== 'string') return;
  void dispatch(request).then((response) => self.postMessage(response));
});

async function dispatch(request: RpcRequest): Promise<RpcResponse> {
  try {
    await ready;
    if (!isWalletMethod(request.method)) {
      throw new Error(`Unknown method: ${request.method}`);
    }
    const method = (engine as unknown as Record<string, unknown>)[request.method];
    if (typeof method !== 'function') {
      throw new Error(`Unknown method: ${request.method}`);
    }
    const result: unknown = await (method as (params?: unknown) => Promise<unknown>).call(
      engine,
      request.params,
    );
    return { id: request.id, ok: true, result: result ?? null };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: {
        code: 'wallet_error',
        message: error instanceof Error ? error.message : 'Something went wrong.',
      },
    };
  }
}
