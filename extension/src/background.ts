import {
  WalletEngine,
  isProviderMethod,
  isWalletMethod,
  type RpcRequest,
  type RpcResponse,
} from '@ledgerly/core';
import { ChromeLocalStore, ChromeSessionStore } from './storage';

/**
 * The wallet engine for the extension, isolated in the MV3 service worker.
 *
 * Nothing on a web page shares a heap with the decrypted keys. Pages reach the
 * engine only through the content script, and only through the provider
 * allowlist below; the popup reaches the privileged surface only because the
 * browser vouches for its extension origin. Neither path can hand out a
 * private key, because no method on either allowlist returns one.
 */
const engine = new WalletEngine({
  store: new ChromeLocalStore(),
  session: new ChromeSessionStore(),
  version: '1.0.0',
  onStateChanged: () => broadcast({ event: 'stateChanged', payload: null }),
  onApprovalRequested: () => {
    broadcast({ event: 'stateChanged', payload: null });
    void openApprovalWindow();
  },
});

const ready = engine.start();

interface WalletMessage {
  readonly channel: 'wallet';
  readonly request: RpcRequest;
}

interface ProviderMessage {
  readonly channel: 'provider';
  readonly request: RpcRequest;
}

type IncomingMessage = WalletMessage | ProviderMessage;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const incoming = message as IncomingMessage | undefined;
  if (!incoming || typeof incoming !== 'object') return;
  const request = incoming.request;
  if (typeof request?.id !== 'string' || typeof request.method !== 'string') return;

  if (incoming.channel === 'wallet') {
    if (!isFromThisExtension(sender)) {
      sendResponse(failure(request.id, 'Requests must come from the Ledgerly interface.'));
      return true;
    }
    void handleWallet(request).then(sendResponse);
    return true;
  }

  if (incoming.channel === 'provider') {
    // The origin comes from the browser's own view of the sender, never from
    // the message body. That is the difference between a permission system
    // and a suggestion.
    if (!sender.tab) {
      sendResponse(failure(request.id, 'Requests must come from a web page.'));
      return true;
    }
    void handleProvider(request, sender.url).then(sendResponse);
    return true;
  }

  return undefined;
});

/**
 * Only extension pages (toolbar popup, approval window, or the wallet opened in
 * a tab) may call privileged methods. The URL is the browser's own view of the
 * sender, so a web page cannot forge it, and content scripts carry the page URL.
 */
function isFromThisExtension(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  return (
    typeof sender.url === 'string' &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
  );
}

async function handleWallet(request: RpcRequest): Promise<RpcResponse> {
  try {
    await ready;
    if (!isWalletMethod(request.method)) throw new Error(`Unknown method: ${request.method}`);
    const method = (engine as unknown as Record<string, unknown>)[request.method];
    if (typeof method !== 'function') throw new Error(`Unknown method: ${request.method}`);
    const result: unknown = await (method as (params?: unknown) => Promise<unknown>).call(
      engine,
      request.params,
    );
    return { id: request.id, ok: true, result: result ?? null };
  } catch (error) {
    return failure(request.id, messageOf(error));
  }
}

async function handleProvider(
  request: RpcRequest,
  senderUrl: string | undefined,
): Promise<RpcResponse> {
  try {
    await ready;
    if (!isProviderMethod(request.method)) throw new Error(`Unknown method: ${request.method}`);
    const surface = engine.provider(senderUrl) as unknown as Record<string, unknown>;
    const method = surface[request.method];
    if (typeof method !== 'function') throw new Error(`Unknown method: ${request.method}`);
    const result: unknown = await (method as (params?: unknown) => Promise<unknown>)(
      request.params,
    );
    return { id: request.id, ok: true, result: result ?? null };
  } catch (error) {
    return failure(request.id, messageOf(error));
  }
}

function failure(id: string, message: string): RpcResponse {
  return { id, ok: false, error: { code: 'wallet_error', message } };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** Extension pages listen for these; a missing receiver is not an error worth surfacing. */
function broadcast(event: { event: string; payload: unknown }): void {
  try {
    chrome.runtime.sendMessage(event, () => void chrome.runtime.lastError);
  } catch {
    /* no extension page is open */
  }
}

/**
 * A site asked for something that needs a human. Prefer the toolbar popup and
 * fall back to a standalone window when the browser will not open it (the
 * popup can only be opened in response to certain events).
 */
async function openApprovalWindow(): Promise<void> {
  try {
    await chrome.action.openPopup();
    return;
  } catch {
    /* fall through */
  }
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 400,
      height: 620,
      focused: true,
    });
  } catch {
    /* the user can still open the wallet from the toolbar */
  }
}
