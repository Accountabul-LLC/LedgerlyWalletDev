/**
 * The page-facing provider, injected as `window.ledgerly`.
 *
 * This code runs in the page's own world, so it is treated as untrusted: it
 * carries no keys, no vault access and no privileged methods. Everything it
 * can ask for is re-validated by the service worker against the provider
 * allowlist, and anything that moves value still requires a human approval in
 * the extension window.
 */
const CHANNEL = 'ledgerly:provider';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

const pending = new Map<string, Pending>();
let nextId = 0;

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as
    { channel?: string; direction?: string; id?: string; payload?: unknown } | undefined;
  if (!data || data.channel !== CHANNEL || data.direction !== 'response') return;
  if (typeof data.id !== 'string') return;

  const call = pending.get(data.id);
  if (!call) return;
  pending.delete(data.id);

  const payload = data.payload as
    { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } };
  if (payload?.ok) {
    call.resolve(payload.result);
  } else {
    const error = new Error(payload?.error?.message ?? 'The request failed.');
    error.name = payload?.error?.code ?? 'wallet_error';
    call.reject(error);
  }
});

function send(method: string, params?: unknown): Promise<unknown> {
  const id = `${Date.now()}-${nextId++}`;
  return new Promise<unknown>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    window.postMessage(
      { channel: CHANNEL, direction: 'request', id, method, params },
      window.location.origin,
    );
  });
}

const provider = Object.freeze({
  isLedgerly: true,
  ping: () => send('ping'),
  getNetwork: () => send('getNetwork'),
  getAccounts: () => send('getAccounts'),
  requestAccounts: () => send('requestAccounts'),
  signTransaction: (input: { address: string; transaction: unknown }) =>
    send('signTransaction', input),
  signAndSubmit: (input: { address: string; transaction: unknown }) => send('signAndSubmit', input),
  disconnect: () => send('disconnect'),
  /** Generic escape hatch; still gated by the same allowlist. */
  request: ({ method, params }: { method: string; params?: unknown }) => send(method, params),
});

Object.defineProperty(window, 'ledgerly', {
  value: provider,
  writable: false,
  configurable: false,
});

window.dispatchEvent(new Event('ledgerly#initialized'));
