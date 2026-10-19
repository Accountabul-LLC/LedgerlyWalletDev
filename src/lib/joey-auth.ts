/**
 * Joey sign-in message rules.
 *
 * These helpers are pure so the readiness suite can prove a proof for address A
 * cannot authenticate address B, a stale or foreign-domain message is refused,
 * and a nonce is hashed the same way the database lookup will hash it.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const JOEY_SIGN_IN_STATEMENT = 'Sign in to Ledgerly with Joey Wallet';
export const JOEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const JOEY_MAX_CLOCK_SKEW_MS = 60 * 1000;
export const JOEY_CHALLENGE_WINDOW_MS = 5 * 60 * 1000;
export const JOEY_MAX_CHALLENGES_PER_WINDOW = 40;

export type JoeySignInMessage = {
  readonly domain: string;
  readonly address: string;
  readonly nonce: string;
  readonly issuedAt: number;
  readonly expiration: number | null;
  readonly uri: string;
  readonly chainId: string | null;
};

export function hashJoeyNonce(nonce: string): string {
  return bytesToHex(sha256(utf8ToBytes(nonce)));
}

function messageField(message: string, name: string): string | null {
  const line = message.split('\n').find((entry) => entry.startsWith(`${name}: `));
  return line?.slice(name.length + 2) ?? null;
}

export function parseJoeySignInMessage(message: string): JoeySignInMessage {
  const lines = message.split('\n');
  const suffix = ' wants you to sign in with your XRPL account:';
  if (!lines[0]?.endsWith(suffix)) throw new Error('Joey returned an invalid sign-in message.');
  const domain = lines[0].slice(0, -suffix.length).toLowerCase();
  const address = lines[1] ?? '';
  const nonce = messageField(message, 'Nonce');
  const issuedAtText = messageField(message, 'Issued At');
  const uri = messageField(message, 'URI');
  const version = messageField(message, 'Version');
  const chainId = messageField(message, 'Chain ID');
  const expirationText = messageField(message, 'Expiration Time');
  const statementPresent = message.includes(`\n\n${JOEY_SIGN_IN_STATEMENT}\n\n`);
  if (!nonce || !issuedAtText || !uri || version !== '1' || !statementPresent) {
    throw new Error('Joey returned an incomplete sign-in message.');
  }
  const issuedAt = Date.parse(issuedAtText);
  const expiration = expirationText ? Date.parse(expirationText) : null;
  if (!Number.isFinite(issuedAt) || (expiration !== null && !Number.isFinite(expiration))) {
    throw new Error('Joey returned an invalid sign-in time.');
  }
  return { domain, address, nonce, issuedAt, expiration, uri, chainId };
}

export function assertJoeySignInMatchesSite(
  parsed: JoeySignInMessage,
  expectedHost: string,
  now = Date.now(),
): void {
  const host = expectedHost.toLowerCase();
  if (parsed.domain !== host) throw new Error('This Joey approval belongs to another site.');
  try {
    if (new URL(parsed.uri).host.toLowerCase() !== host) {
      throw new Error('The Joey sign-in address does not match this site.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The Joey')) throw error;
    throw new Error('The Joey sign-in address does not match this site.');
  }
  if (parsed.chainId !== '0' && parsed.chainId !== 'xrpl:0' && parsed.chainId !== null) {
    throw new Error('Joey must be connected to XRP Ledger Mainnet to sign in.');
  }
  if (Math.abs(now - parsed.issuedAt) > JOEY_CHALLENGE_TTL_MS + JOEY_MAX_CLOCK_SKEW_MS) {
    throw new Error('That Joey approval has expired. Please try again.');
  }
  if (parsed.expiration !== null && parsed.expiration < now) {
    throw new Error('That Joey approval has expired. Please try again.');
  }
}

export function buildJoeySignInMessage(input: {
  host: string;
  address: string;
  nonce: string;
  issuedAt: string;
  uri: string;
  chainId?: string;
}): string {
  return [
    `${input.host} wants you to sign in with your XRPL account:`,
    input.address,
    '',
    JOEY_SIGN_IN_STATEMENT,
    '',
    `URI: ${input.uri}`,
    'Version: 1',
    `Chain ID: ${input.chainId ?? 'xrpl:0'}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
  ].join('\n');
}
