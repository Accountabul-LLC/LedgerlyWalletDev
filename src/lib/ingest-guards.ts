/**
 * Guards for anything that arrives from outside the app: a visitor's search
 * box, or a third-party token feed.
 *
 * The rule these encode is simple. Nothing reaches the database or a filter
 * string in the shape it arrived in. Every value is shape-checked, bounded and
 * stripped of characters that carry meaning somewhere downstream. They are pure
 * functions with no imports so the readiness suite can hammer them directly.
 */

/** Classic XRPL address shape. Checksum checks stay in the core codec. */
export const CLASSIC_ADDRESS_PATTERN = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

const LEDGER_CURRENCY_PATTERN = /^([A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}|[0-9A-Fa-f]{40})$/;

// Stored text cannot contain ASCII controls, zero-width characters, or bidi overrides.
// eslint-disable-next-line no-control-regex -- stored text cannot contain control characters
const STORED_TEXT_CONTROLS = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

const SEARCH_TERM_EXCLUDED = /[^A-Za-z0-9 -]/g;

const PRIVATE_IMAGE_HOST =
  /(?:^|\.)(?:localhost|local|internal|test|invalid|onion|home|arpa|lan|private|localdomain|intranet)$/;

const SVG_IMAGE_PATH = /\.svg(?:z)?$/i;
const BRACKET_HOST = /^\[/;
const NUMERIC_HOST = /^[0-9.]+$/;

/** XRPL currency codes are a 3 character code or 40 hex characters. */
export function isLedgerCurrency(value: unknown): value is string {
  return typeof value === 'string' && LEDGER_CURRENCY_PATTERN.test(value);
}

/** Classic XRPL addresses only, so no free text can land in a key column. */
export function isLedgerAddress(value: unknown): value is string {
  return typeof value === 'string' && CLASSIC_ADDRESS_PATTERN.test(value);
}

/** Bounded, control-character free, single line text, or null. */
export function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(STORED_TEXT_CONTROLS, ' ').trim().slice(0, max);
  return cleaned === '' ? null : cleaned;
}

/** Only absolute https image URLs survive; anything else becomes null. */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== '443') ||
      !host.includes('.') ||
      PRIVATE_IMAGE_HOST.test(host) ||
      host.includes(':') ||
      BRACKET_HOST.test(host) ||
      NUMERIC_HOST.test(host) ||
      SVG_IMAGE_PATH.test(decodeURIComponent(url.pathname))
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Any input becomes a whole number inside the range, never NaN or Infinity. */
export function boundedInt(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
    return min;
  }
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * A directory search term is placed inside a PostgREST filter grammar, so the
 * defence is an allowlist rather than escaping: only letters, digits, space
 * and dash survive. Underscore and percent are LIKE wildcards, so they do not
 * pass. Nothing left can close a filter, start another one, or act as a wildcard.
 */
export function searchTerm(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(SEARCH_TERM_EXCLUDED, '').trim().slice(0, 40);
}
