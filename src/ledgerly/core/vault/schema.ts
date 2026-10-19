import type { KdfParams } from '../crypto/kdf';

export const VAULT_VERSION = 1;

/** Everything an attacker sees if they read the extension's storage area. */
export interface VaultRecord {
  readonly version: number;
  /**
   * Identity of this vault. Two vaults on the same device are never the same
   * wallet, so a session, a cached payload or a pending write that carries a
   * different id is stale by definition and must be refused rather than
   * silently applied.
   */
  readonly id?: string;
  /** Bumped on every write, so an older copy can never overwrite a newer one. */
  readonly generation?: number;
  readonly kdf: KdfParams;
  /** Base64 KDF salt, unique per vault. */
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type KeyAlgorithm = 'ed25519' | 'secp256k1';

/**
 * How an account's private key is reproduced at unlock time. Derived accounts
 * cost nothing to store; imported accounts must keep their own secret.
 */
export type AccountSource =
  | { readonly kind: 'derived'; readonly index: number }
  /**
   * A wallet the user asked to keep unlinked: it carries its own recovery
   * phrase and derives at index 0 of that phrase, so the vault phrase does not
   * restore it.
   */
  | { readonly kind: 'ownPhrase'; readonly mnemonic: string }
  | { readonly kind: 'imported'; readonly seed: string; readonly algorithm: KeyAlgorithm }
  /**
   * A wallet held in another app, connected by address only. There is no
   * secret here and never will be: the outside wallet signs, this app only
   * watches the address and hands transactions over for approval.
   */
  | { readonly kind: 'external'; readonly provider: ExternalProviderId; readonly address: string };

/** Outside wallets this app can connect to. */
export type ExternalProviderId = 'joey';

export interface StoredAccount {
  readonly id: string;
  readonly label: string;
  readonly address: string;
  readonly source: AccountSource;
  readonly createdAt: number;
}

export interface Contact {
  readonly id: string;
  readonly label: string;
  readonly address: string;
  readonly destinationTag?: number;
  readonly note?: string;
}

/** The decrypted vault. This value only ever exists inside the isolated engine context. */
export interface VaultPayload {
  /** Present when the wallet was created or imported from a recovery phrase. */
  readonly mnemonic: string | null;
  readonly accounts: readonly StoredAccount[];
  readonly contacts: readonly Contact[];
}

export function emptyPayload(mnemonic: string | null): VaultPayload {
  return { mnemonic, accounts: [], contacts: [] };
}

function isKdfParams(value: unknown): value is KdfParams {
  if (typeof value !== 'object' || value === null) return false;
  const params = value as Record<string, unknown>;
  return (
    params.algorithm === 'argon2id' &&
    typeof params.m === 'number' &&
    typeof params.t === 'number' &&
    typeof params.p === 'number' &&
    typeof params.version === 'number'
  );
}

export function isVaultRecord(value: unknown): value is VaultRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.version === 'number' &&
    isKdfParams(record.kdf) &&
    typeof record.salt === 'string' &&
    typeof record.iv === 'string' &&
    typeof record.ciphertext === 'string'
  );
}

/**
 * Validates a decrypted payload before it is trusted. Decryption proves the
 * bytes were not tampered with, not that they have the shape this version
 * expects, so a vault written by a future version fails loudly here.
 */
export function parsePayload(raw: unknown): VaultPayload {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('vault payload is not an object');
  }
  const payload = raw as Record<string, unknown>;
  const mnemonic = payload.mnemonic;
  if (mnemonic !== null && typeof mnemonic !== 'string') {
    throw new Error('vault payload has an invalid recovery phrase field');
  }
  if (!Array.isArray(payload.accounts)) {
    throw new Error('vault payload is missing its account list');
  }
  const accounts = payload.accounts.map(parseAccount);
  const contacts = Array.isArray(payload.contacts) ? payload.contacts.map(parseContact) : [];
  return { mnemonic, accounts, contacts };
}

function parseAccount(raw: unknown): StoredAccount {
  if (typeof raw !== 'object' || raw === null) throw new Error('invalid stored account');
  const account = raw as Record<string, unknown>;
  if (
    typeof account.id !== 'string' ||
    typeof account.label !== 'string' ||
    typeof account.address !== 'string' ||
    typeof account.createdAt !== 'number'
  ) {
    throw new Error('invalid stored account');
  }
  return {
    id: account.id,
    label: account.label,
    address: account.address,
    createdAt: account.createdAt,
    source: parseSource(account.source),
  };
}

function parseSource(raw: unknown): AccountSource {
  if (typeof raw !== 'object' || raw === null) throw new Error('invalid account source');
  const source = raw as Record<string, unknown>;
  if (source.kind === 'derived' && typeof source.index === 'number') {
    return { kind: 'derived', index: source.index };
  }
  if (source.kind === 'ownPhrase' && typeof source.mnemonic === 'string') {
    return { kind: 'ownPhrase', mnemonic: source.mnemonic };
  }
  if (
    source.kind === 'imported' &&
    typeof source.seed === 'string' &&
    (source.algorithm === 'ed25519' || source.algorithm === 'secp256k1')
  ) {
    return { kind: 'imported', seed: source.seed, algorithm: source.algorithm };
  }
  if (
    source.kind === 'external' &&
    source.provider === 'joey' &&
    typeof source.address === 'string'
  ) {
    return { kind: 'external', provider: 'joey', address: source.address };
  }
  throw new Error('invalid account source');
}

function parseContact(raw: unknown): Contact {
  if (typeof raw !== 'object' || raw === null) throw new Error('invalid contact');
  const contact = raw as Record<string, unknown>;
  if (
    typeof contact.id !== 'string' ||
    typeof contact.label !== 'string' ||
    typeof contact.address !== 'string'
  ) {
    throw new Error('invalid contact');
  }
  return {
    id: contact.id,
    label: contact.label,
    address: contact.address,
    ...(typeof contact.destinationTag === 'number' ? { destinationTag: contact.destinationTag } : {}),
    ...(typeof contact.note === 'string' ? { note: contact.note } : {}),
  };
}
