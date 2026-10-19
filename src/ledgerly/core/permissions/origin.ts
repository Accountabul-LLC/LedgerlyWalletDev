/**
 * Origin handling for connected sites.
 *
 * The single rule this module exists to enforce: an origin is only ever
 * computed from what the browser reports about the sender of a message. It is
 * never read out of the message body. A content script runs inside a page the
 * attacker may control, so any origin it *claims* is worthless — the value that
 * matters is the one `chrome.runtime.MessageSender` carries, which the page
 * cannot forge.
 */

export interface OriginInfo {
  /** Scheme + host + port, e.g. `https://example.com`. */
  readonly origin: string;
  readonly hostname: string;
  readonly isSecure: boolean;
}

/**
 * Parses a browser-reported URL into an origin. Only http and https are
 * accepted: `file:` pages share one opaque origin and would let any local
 * HTML file inherit another's permissions.
 */
export function parseOrigin(url: string | undefined): OriginInfo | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }
  // Localhost over plain http stays usable so dApps can be developed locally.
  const isSecure = parsed.protocol === 'https:' || isLoopback(parsed.hostname);
  return { origin: parsed.origin, hostname: parsed.hostname, isSecure };
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Rejects anything that is not already a bare origin, so stored keys stay canonical. */
export function isCanonicalOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === value && (url.protocol === 'https:' || url.protocol === 'http:');
  } catch {
    return false;
  }
}

export function displayOrigin(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
