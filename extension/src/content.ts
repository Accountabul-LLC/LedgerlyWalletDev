/**
 * The content script.
 *
 * It runs in an isolated world: it can talk to the page and to the service
 * worker, but the page cannot read its variables. It holds no keys and makes
 * no decisions. Its only job is to relay provider calls, and the service
 * worker re-checks every one of them against the provider allowlist using the
 * origin the browser reports, not anything this script or the page claims.
 */
const CHANNEL = 'ledgerly:provider';

function injectProvider(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inpage.js');
  script.async = false;
  const parent = document.head ?? document.documentElement;
  parent.prepend(script);
  script.remove();
}

injectProvider();

window.addEventListener('message', (event: MessageEvent) => {
  // Only messages this page posted to itself, in our envelope, are relayed.
  if (event.source !== window) return;
  const data = event.data as
    | { channel?: string; direction?: string; id?: unknown; method?: unknown; params?: unknown }
    | undefined;
  if (!data || data.channel !== CHANNEL || data.direction !== 'request') return;
  if (typeof data.id !== 'string' || typeof data.method !== 'string') return;

  chrome.runtime.sendMessage(
    { channel: 'provider', request: { id: data.id, method: data.method, params: data.params } },
    (raw) => {
      const runtimeError = chrome.runtime.lastError;
      const response = raw as
        | { ok: true; result: unknown }
        | { ok: false; error: { code: string; message: string } }
        | undefined;

      const payload = runtimeError
        ? {
            ok: false as const,
            error: { code: 'wallet_error', message: 'Ledgerly is not available.' },
          }
        : (response ?? {
            ok: false as const,
            error: { code: 'wallet_error', message: 'Ledgerly is not available.' },
          });

      window.postMessage(
        { channel: CHANNEL, direction: 'response', id: data.id, payload },
        window.location.origin,
      );
    },
  );
});
