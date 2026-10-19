import { isValidAddress } from '@ledgerly/core/shared';
import { parseDestinationTag } from '../../src/ledgerly/native/destinationTag';
import {
  explorerAccountUrl as sharedExplorerAccountUrl,
  explorerTxUrl as sharedExplorerTxUrl,
} from '../../src/ledgerly/ui/format';

/**
 * Time, duration, ticker, and explorer labels shared with the website.
 * Explorer helpers keep the phone argument shape: each link only needs the
 * template it reads. The scanner below turns a camera payload into an address,
 * tag, and amount.
 */
import { assetTicker as formatAssetTicker } from '../../src/ledgerly/ui/format';

export {
  assetTicker,
  formatDuration,
  formatRelativeTime,
  initialsOf,
  tokenBadgeLabel,
} from '../../src/ledgerly/ui/format';

/** XRP is the ledger's native asset, so the phone does not prefix it with $. */
export function ledgerAssetLabel(code: string): string {
  const trimmed = code.trim();
  if (trimmed.toUpperCase() === 'XRP') return 'XRP';
  return formatAssetTicker(trimmed);
}

export function explorerTxUrl(network: { explorerTx: string }, hash: string): string | null {
  return sharedExplorerTxUrl({ explorerTx: network.explorerTx, explorerAccount: '' }, hash);
}

export function explorerAccountUrl(
  network: { explorerAccount: string },
  address: string,
): string | null {
  return sharedExplorerAccountUrl(
    { explorerTx: '', explorerAccount: network.explorerAccount },
    address,
  );
}

export interface ScannedPayment {
  readonly address: string;
  readonly destinationTag?: string;
  readonly amount?: string;
}

export function parseScannedAddress(raw: string): ScannedPayment | null {
  try {
    return parsePaymentUri(raw);
  } catch {
    return null;
  }
}

function parsePaymentUri(raw: string): ScannedPayment | null {
  const text = raw.trim();
  if (!text) return null;
  if (isValidAddress(text)) return { address: text };

  const match = /^(?:xrpl|ripple|xrp):\/{0,2}([^?\s]+)(\?.*)?$/i.exec(text);
  if (!match) return null;

  const address = decodeURIComponent(match[1] ?? '');
  if (!isValidAddress(address)) return null;

  const params = new URLSearchParams((match[2] ?? '').replace(/^\?/, ''));
  const tags = ['dt', 'destinationTag', 'tag'].flatMap((key) => params.getAll(key));
  if (tags.length > 1) return null;
  const tag = tags[0];
  const parsedTag = tag === undefined ? undefined : parseDestinationTag(tag);
  if (tag !== undefined && parsedTag === undefined) return null;
  const amount = params.get('amount') ?? params.get('value');

  return {
    address,
    ...(parsedTag === undefined ? {} : { destinationTag: String(parsedTag) }),
    ...(amount && /^[0-9.]+$/.test(amount) ? { amount } : {}),
  };
}
