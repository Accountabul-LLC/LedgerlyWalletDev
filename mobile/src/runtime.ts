import {
  MemorySessionStore,
  WalletEngine,
  isWalletMethod,
  type KeyValueStore,
  type RpcEvent,
  type RpcRequest,
  type RpcResponse,
} from '@ledgerly/core';
import { ForegroundWallet } from '../../src/ledgerly/native/foreground';

export interface MobileTransport {
  request(method: string, params?: unknown): Promise<unknown>;
  subscribe(listener: (event: RpcEvent) => void): () => void;
  setActive(active: boolean): Promise<void>;
}

/**
 * The phone host for the wallet engine.
 *
 * React Native has no dedicated worker the way the web app does, so the engine
 * shares a JS runtime with the screens. The isolation that still holds is the
 * same allowlist the web worker uses: UI code talks only through `request()`,
 * and anything not on `WALLET_METHODS` is refused. Screens never import this
 * module — they import `createWalletClient` and the shared types.
 */
export function createMobileRuntime(store: KeyValueStore): MobileTransport {
  const listeners = new Set<(event: RpcEvent) => void>();
  const notify = () => {
    const event: RpcEvent = { event: 'stateChanged', payload: null };
    for (const listener of listeners) listener(event);
  };

  const engine = new WalletEngine({
    store,
    session: new MemorySessionStore(),
    version: '1.0.0-mobile',
    onStateChanged: notify,
    onApprovalRequested: notify,
  });
  const ready = engine.start();
  const lifecycle = new ForegroundWallet(() => engine.lock());
  let nextId = 0;
  let approvalGeneration = 0;
  let networkChanges = 0;
  let networkQueue: Promise<void> = Promise.resolve();
  let initialVaultPending = false;
  const approvals = new Map<string, number>();
  function invalidateApprovals() {
    approvalGeneration++;
    for (const requestId of approvals.keys()) void engine.discardPrepared({ requestId });
    approvals.clear();
  }

  async function dispatch(request: RpcRequest): Promise<RpcResponse> {
    const requestGeneration = approvalGeneration;
    try {
      await ready;
      if (!isWalletMethod(request.method)) {
        throw new Error(`Unknown method: ${request.method}`);
      }
      const method = (engine as unknown as Record<string, unknown>)[request.method];
      if (typeof method !== 'function') {
        throw new Error(`Unknown method: ${request.method}`);
      }
      const invoke = async () => {
        const generation = requestGeneration;
        if (
          (request.method === 'preparePayment' || request.method === 'prepareTrustSet') &&
          (generation !== approvalGeneration || networkChanges > 0)
        ) {
          throw new Error('The wallet or network changed. Review this payment again.');
        }
        if (['preparePayment', 'prepareTrustSet', 'confirmPrepared'].includes(request.method)) {
          const state = await engine.getState();
          if (
            generation !== approvalGeneration ||
            networkChanges > 0 ||
            state.network.id !== state.connection.networkId
          ) {
            throw new Error('The wallet or network changed. Review this payment again.');
          }
        }
        const params = request.params as { requestId?: string } | undefined;
        if (request.method === 'confirmPrepared') {
          const requestId = params?.requestId;
          if (!requestId || approvals.get(requestId) !== generation) {
            throw new Error('The wallet or network changed. Review this payment again.');
          }
          // Consume the approval before invoking signing, including double presses.
          approvals.delete(requestId);
        }
        if (request.method === 'discardPrepared' && params?.requestId)
          approvals.delete(params.requestId);
        const previousNetwork =
          request.method === 'setPreferences' ? (await engine.getState()).network.id : null;
        const result = await (method as (params?: unknown) => Promise<unknown>).call(
          engine,
          request.params,
        );
        const nextNetwork = previousNetwork === null ? null : (await engine.getState()).network.id;
        if (nextNetwork !== null && nextNetwork !== previousNetwork) {
          // Hiding the active test network changes the core's visible fallback.
          // Explicitly select it so the connection and persisted network agree.
          await engine.setNetwork({ networkId: nextNetwork });
        }
        if (request.method === 'preparePayment' || request.method === 'prepareTrustSet') {
          const prepared = result as { requestId: string };
          if (generation !== approvalGeneration) {
            await engine.discardPrepared({ requestId: prepared.requestId });
            throw new Error('The wallet or network changed. Review this payment again.');
          }
          approvals.set(prepared.requestId, generation);
        }
        return result;
      };
      const result: unknown =
        request.method === 'getState' || request.method === 'lock'
          ? await invoke()
          : await lifecycle.run(invoke);
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

  return {
    setActive: (active) => {
      if (!active) invalidateApprovals();
      return lifecycle.setActive(active);
    },
    request(method, params) {
      const initialVaultMutation = ['createWallet', 'importFromSeed'].includes(method);
      if (initialVaultMutation && initialVaultPending)
        return Promise.reject(new Error('Wallet setup is already in progress.'));
      if (initialVaultMutation) initialVaultPending = true;
      if (
        [
          'lock',
          'resetWallet',
          'setNetwork',
          'removeCustomNetwork',
          'selectAccount',
          'switchAccount',
          'removeAccount',
          'setPreferences',
        ].includes(method)
      )
        invalidateApprovals();
      const changesNetwork = ['setNetwork', 'removeCustomNetwork', 'setPreferences'].includes(
        method,
      );
      if (changesNetwork) networkChanges++;
      const id = String(nextId++);
      const run = () => dispatch({ id, method, params });
      const response = changesNetwork ? networkQueue.then(run, run) : run();
      if (changesNetwork)
        networkQueue = response.then(
          () => undefined,
          () => undefined,
        );
      return response
        .then((response) => {
          if (!response.ok) {
            const error = new Error(response.error.message);
            error.name = response.error.code;
            throw error;
          }
          return response.result;
        })
        .finally(() => {
          if (initialVaultMutation) initialVaultPending = false;
          if (changesNetwork) networkChanges--;
        });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
