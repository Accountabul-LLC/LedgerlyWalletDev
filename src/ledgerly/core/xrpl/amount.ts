/**
 * Money handling for the XRP Ledger.
 *
 * Every value here is a decimal string converted through BigInt. Nothing in
 * this file may go through `Number`: 0.1 + 0.2 is a rounding curiosity in most
 * software and a lost payment in a wallet.
 */

export const DROPS_PER_XRP = 1_000_000n;
export const XRP_DECIMALS = 6;

/** Total XRP that will ever exist, in drops. Amounts above this are rejected outright. */
export const MAX_DROPS = 100_000_000_000_000_000n;

const DECIMAL_PATTERN = /^-?(\d+)(\.(\d+))?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_PATTERN.test(value.trim());
}

/** Parses a user-entered XRP amount into drops, rejecting excess precision rather than truncating it. */
export function xrpToDrops(value: string): string {
  const trimmed = value.trim();
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error('Enter a valid amount.');
  }
  if (trimmed.startsWith('-')) {
    throw new Error('Amount cannot be negative.');
  }

  const whole = match[1] as string;
  const fraction = match[3] ?? '';
  if (fraction.length > XRP_DECIMALS) {
    throw new Error(`XRP supports at most ${XRP_DECIMALS} decimal places.`);
  }

  const padded = fraction.padEnd(XRP_DECIMALS, '0');
  const drops = BigInt(whole) * DROPS_PER_XRP + BigInt(padded || '0');
  if (drops > MAX_DROPS) {
    throw new Error('Amount exceeds the total XRP supply.');
  }
  return drops.toString();
}

export function dropsToXrp(drops: string | bigint): string {
  const value = typeof drops === 'bigint' ? drops : BigInt(drops);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / DROPS_PER_XRP;
  const fraction = (absolute % DROPS_PER_XRP).toString().padStart(XRP_DECIMALS, '0').replace(/0+$/, '');
  const text = fraction.length > 0 ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${text}` : text;
}

/** Groups the integer part and keeps the exact fractional digits, for display only. */
export function formatAmount(value: string, maxFractionDigits = 6): string {
  const [whole = '0', fraction = ''] = value.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return trimmed.length > 0 ? `${sign}${grouped}.${trimmed}` : `${sign}${grouped}`;
}

/** Ascending comparator over decimal strings of arbitrary magnitude. */
export function compareDecimal(a: string, b: string): number {
  const scaled = (value: string): bigint => {
    const [whole = '0', fraction = ''] = value.split('.');
    const negative = whole.startsWith('-');
    const magnitude = BigInt((negative ? whole.slice(1) : whole) + fraction.padEnd(18, '0').slice(0, 18));
    return negative ? -magnitude : magnitude;
  };
  const left = scaled(a);
  const right = scaled(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

const STANDARD_CURRENCY = /^[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}$/;
const HEX_CURRENCY = /^[0-9A-Fa-f]{40}$/;

export function isValidCurrencyCode(code: string): boolean {
  return STANDARD_CURRENCY.test(code) || HEX_CURRENCY.test(code);
}

/**
 * Issuers may name a token with either a three-character code or a 160-bit hex
 * blob. The hex form usually holds a padded ASCII name, so it is decoded for
 * display — but only when the result is printable, since a token name is
 * attacker-controlled text that ends up in the approval screen.
 */
export function currencyToDisplay(code: string): string {
  if (STANDARD_CURRENCY.test(code)) return code.toUpperCase();
  if (!HEX_CURRENCY.test(code)) return code;

  const bytes = code.match(/../g) ?? [];
  const decoded = bytes
    .map((pair) => parseInt(pair, 16))
    .filter((byte) => byte !== 0)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .trim();

  const truncated = `${code.slice(0, 8)}…`;
  if (decoded.length === 0 || !/^[\x20-\x7e]+$/.test(decoded)) return truncated;

  /*
   * Anyone can issue a token whose 160-bit code spells XRP. Rendering that as
   * plain "XRP" would put a worthless token next to the native asset under an
   * identical label, which is exactly the confusion the scam depends on. The
   * three-character form is the only real XRP and is handled above.
   */
  if (decoded.toUpperCase() === 'XRP') return truncated;

  return decoded;
}

export function currencyToHex(code: string): string {
  if (HEX_CURRENCY.test(code)) return code.toUpperCase();
  if (STANDARD_CURRENCY.test(code)) return code;
  throw new Error('Unsupported currency code.');
}

/** XRPL issued amounts carry at most 15 significant digits; more is silently rounded by the ledger. */
export function assertIssuedPrecision(value: string): void {
  const digits = value.replace(/[-.]/g, '').replace(/^0+/, '');
  if (digits.length > 15) {
    throw new Error('Issued tokens support at most 15 significant digits.');
  }
}

export function addDrops(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

/**
 * Subtracts and floors at zero. Used for reserve arithmetic, where an account
 * holding less than its reserve has zero spendable balance rather than a
 * negative one.
 */
export function subtractDropsToZero(a: string, b: string): string {
  const result = BigInt(a) - BigInt(b);
  return result < 0n ? '0' : result.toString();
}
