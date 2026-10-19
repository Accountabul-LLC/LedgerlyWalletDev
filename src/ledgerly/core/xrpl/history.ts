import type { AccountTxResponse } from 'xrpl';
import { dropsToXrp, formatAmount } from './amount';
import { formatAmountValue } from './describe';
import type { HistoryEntry } from '../rpc/protocol';

/** The XRPL counts seconds from 2000-01-01T00:00:00Z rather than the Unix epoch. */
const RIPPLE_EPOCH_OFFSET_SECONDS = 946_684_800;

type RawEntry = AccountTxResponse['result']['transactions'][number];

export function rippleTimeToUnixMs(rippleSeconds: number): number {
  return (rippleSeconds + RIPPLE_EPOCH_OFFSET_SECONDS) * 1000;
}

/**
 * Flattens a raw `account_tx` entry into a row for the activity list.
 *
 * The delivered amount is preferred over the requested one wherever metadata
 * provides it. For a partial payment those two differ, and showing the
 * requested figure would report money that never arrived.
 */
export function toHistoryEntry(raw: RawEntry, address: string): HistoryEntry | null {
  const tx = extractTransaction(raw);
  if (!tx) return null;

  const meta = raw.meta;
  const engineResult =
    typeof meta === 'object' && meta !== null && 'TransactionResult' in meta
      ? (meta as { TransactionResult: string }).TransactionResult
      : 'unknown';

  const source = typeof tx.Account === 'string' ? tx.Account : '';
  const destination = typeof tx.Destination === 'string' ? tx.Destination : null;
  const direction: HistoryEntry['direction'] =
    source === address && destination === address
      ? 'self'
      : source === address
        ? 'out'
        : 'in';

  const delivered =
    typeof meta === 'object' && meta !== null && 'delivered_amount' in meta
      ? (meta as { delivered_amount?: unknown }).delivered_amount
      : undefined;
  const shown = delivered !== undefined && delivered !== 'unavailable' ? delivered : tx.Amount;

  const type = typeof tx.TransactionType === 'string' ? tx.TransactionType : 'Unknown';
  const amount = shown === undefined ? null : formatAmountValue(shown);

  return {
    hash: extractHash(raw, tx),
    type,
    direction,
    headline: headlineFor(type, direction),
    amount,
    counterparty: direction === 'out' ? destination : source || null,
    timestamp: extractTimestamp(raw, tx),
    succeeded: engineResult === 'tesSUCCESS',
    feeXrp: typeof tx.Fee === 'string' ? formatAmount(dropsToXrp(tx.Fee)) : '0',
  };
}

function headlineFor(type: string, direction: HistoryEntry['direction']): string {
  if (type === 'Payment') {
    if (direction === 'in') return 'Received';
    if (direction === 'out') return 'Sent';
    return 'Sent to self';
  }
  if (type === 'TrustSet') return 'Trust line updated';
  if (type === 'OfferCreate') return 'Order placed';
  if (type === 'OfferCancel') return 'Order cancelled';
  if (type === 'AccountSet') return 'Account settings changed';
  if (type === 'NFTokenMint') return 'NFT minted';
  if (type === 'NFTokenBurn') return 'NFT burned';
  return type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * `account_tx` moved the transaction body from `tx` to `tx_json` in API v2, and
 * public clusters still run a mix of versions. Both shapes are read so history
 * does not silently come back empty against one of them.
 */
function extractTransaction(raw: RawEntry): Record<string, unknown> | null {
  const candidate = raw as { tx?: unknown; tx_json?: unknown };
  const body = candidate.tx_json ?? candidate.tx;
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
}

function extractHash(raw: RawEntry, tx: Record<string, unknown>): string {
  const outer = (raw as { hash?: unknown }).hash;
  if (typeof outer === 'string') return outer;
  return typeof tx.hash === 'string' ? tx.hash : '';
}

function extractTimestamp(raw: RawEntry, tx: Record<string, unknown>): number | null {
  const iso = (raw as { close_time_iso?: unknown }).close_time_iso;
  if (typeof iso === 'string') {
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const rippleTime = tx.date;
  return typeof rippleTime === 'number' ? rippleTimeToUnixMs(rippleTime) : null;
}
