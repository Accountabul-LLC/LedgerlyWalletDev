/**
 * Reads a public XRPL payment well enough to price the landing-page counter.
 *
 * The browser never supplies the amount. Only a validated Payment on the
 * requested network can move the published total, and the same hash can only
 * be counted once.
 */
export type ValidatedPayment = {
  readonly hash: string;
  readonly amount: number;
  readonly currency: string;
};

const HASH = /^[0-9A-Fa-f]{64}$/;

export function isLedgerPaymentHash(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

function parseIssuedOrXrp(value: unknown): { amount: number; currency: string } | null {
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) return null;
    const drops = Number(value);
    if (!Number.isFinite(drops) || drops <= 0) return null;
    return { amount: drops / 1_000_000, currency: 'XRP' };
  }
  if (typeof value !== 'object' || value === null) return null;
  const row = value as { value?: unknown; currency?: unknown };
  const amount = Number(row.value);
  const currency = typeof row.currency === 'string' ? row.currency : '';
  if (!Number.isFinite(amount) || amount <= 0 || currency === '') return null;
  return { amount, currency };
}

/**
 * Accepts the `result` object from a public `tx` RPC call. Anything that is
 * not a validated Payment is ignored, so a failed or non-payment transaction
 * cannot move the published total.
 */
export function parseValidatedPayment(result: Record<string, unknown>): ValidatedPayment | null {
  if (result.validated !== true) return null;
  // API v2 nests transaction fields inside tx_json; older servers return them at the top level.
  const tx =
    typeof result.tx_json === 'object' && result.tx_json !== null
      ? (result.tx_json as Record<string, unknown>)
      : result;
  if (tx.TransactionType !== 'Payment') return null;
  const hash = typeof result.hash === 'string' ? result.hash : '';
  if (!isLedgerPaymentHash(hash)) return null;

  const meta = result.meta;
  if (
    typeof meta !== 'object' ||
    meta === null ||
    !('TransactionResult' in meta) ||
    meta.TransactionResult !== 'tesSUCCESS'
  )
    return null;
  const delivered =
    typeof meta === 'object' && meta !== null && 'delivered_amount' in meta
      ? (meta as { delivered_amount?: unknown }).delivered_amount
      : undefined;
  // Never substitute the requested amount for an unknown partial delivery.
  if (delivered === 'unavailable') return null;
  const flags = typeof tx.Flags === 'number' ? tx.Flags : 0;
  if (delivered === undefined && (flags & 0x00020000) !== 0) return null;
  const parsed = parseIssuedOrXrp(delivered ?? tx.Amount ?? tx.DeliverMax);
  if (!parsed) return null;
  return { hash: hash.toUpperCase(), amount: parsed.amount, currency: parsed.currency };
}
