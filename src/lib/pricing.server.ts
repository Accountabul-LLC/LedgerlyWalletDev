/**
 * Server-side pricing for the public "value sent" counter.
 *
 * Only two things are priced: XRP, at the live market rate, and dollar
 * stablecoins, at one dollar. Anything else is worth 0 for counting purposes,
 * because there is no rate we would trust enough to publish a total from.
 */

const PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd';
const CACHE_MS = 60_000;

let cachedPrice: number | null = null;
let cachedAt = 0;

/** Live XRP/USD rate, or null when the price feed cannot be reached. */
export async function xrpUsdPrice(): Promise<number | null> {
  const now = Date.now();
  if (cachedPrice !== null && now - cachedAt < CACHE_MS) return cachedPrice;
  try {
    const response = await fetch(PRICE_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return cachedPrice;
    const body = (await response.json()) as { ripple?: { usd?: number } };
    const price = Number(body.ripple?.usd);
    if (!Number.isFinite(price) || price <= 0) return cachedPrice;
    cachedPrice = price;
    cachedAt = now;
    return price;
  } catch {
    return cachedPrice;
  }
}

/** Currency codes we treat as one dollar. Both ASCII and 40 character hex. */
const STABLE_CODES = new Set([
  'USD',
  'USDC',
  'USDT',
  'RLUSD',
  // RLUSD as the ledger stores it: hex encoded, right padded to 40 characters.
  '524C555344000000000000000000000000000000',
  // "USD" hex encoded, used by some issuers.
  '5553440000000000000000000000000000000000',
]);

/**
 * The only three conversion buckets that exist:
 *   xrp    - priced at the live rate
 *   stable - one dollar each
 *   none   - not priced, counted at zero
 */
export type PriceBucket = 'xrp' | 'stable' | 'none';

export function bucketFor(currency: string): PriceBucket {
  const code = currency.trim().toUpperCase();
  if (code === 'XRP') return 'xrp';
  if (STABLE_CODES.has(code)) return 'stable';
  return 'none';
}

/** Highest figure a single payment may add to the public total. */
export const MAX_ROW_USD = 1_000_000_000;

/**
 * Pure conversion. Given the same amount, currency and XRP rate this always
 * returns the same dollar figure, so the public total can be recomputed and
 * checked at any time. Anything unpriceable, unparseable or implausible is 0,
 * which keeps the payment counted without guessing at its worth.
 */
export function convertToUsd(amount: number, currency: string, xrpPrice: number | null): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const bucket = bucketFor(currency);
  if (bucket === 'none') return 0;
  if (bucket === 'stable') return round2(amount);
  if (xrpPrice === null || !Number.isFinite(xrpPrice) || xrpPrice <= 0) return 0;
  return round2(amount * xrpPrice);
}

/**
 * Converts a signed payment into a dollar figure, fetching the rate as needed.
 */
export async function usdValueOf(amount: number, currency: string): Promise<number> {
  const price = bucketFor(currency) === 'xrp' ? await xrpUsdPrice() : null;
  return convertToUsd(amount, currency, price);
}

function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  // Keep a single row from dominating the public total if something odd slips
  // through: nothing above a billion dollars is plausible here.
  return rounded > MAX_ROW_USD ? 0 : rounded;
}
