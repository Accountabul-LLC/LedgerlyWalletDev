import { HDKey } from '@scure/bip32';
import { decodeSeed } from 'ripple-address-codec';
import { deriveAddress, deriveKeypair } from 'ripple-keypairs';
import { bytesToHex, wipe } from '../crypto/bytes';
import type { AccountSource, KeyAlgorithm } from '../vault/schema';
import { mnemonicToMasterSeed } from './mnemonic';

/** SLIP-44 registers coin type 144 for XRP. */
export const XRPL_COIN_TYPE = 144;

export interface Keypair {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly address: string;
  readonly algorithm: KeyAlgorithm;
}

export function derivationPath(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new RangeError('account index out of range');
  }
  return `m/44'/${XRPL_COIN_TYPE}'/${index}'/0/0`;
}

/**
 * Derives an account from an already-computed BIP39 master seed.
 *
 * secp256k1 is used rather than Ed25519 because this is the curve the XRPL
 * hardware and mobile ecosystem derives with at this path — a phrase exported
 * from here restores in Xaman or on a Ledger device and lands on the same
 * addresses. The XRPL private key wire format is the 32-byte scalar prefixed
 * with `00` to distinguish it from an Ed25519 key.
 */
export function deriveFromMasterSeed(masterSeed: Uint8Array, index: number): Keypair {
  const root = HDKey.fromMasterSeed(masterSeed);
  try {
    const child = root.derive(derivationPath(index));
    if (!child.privateKey || !child.publicKey) {
      throw new Error('key derivation produced no private key');
    }
    const privateKey = `00${bytesToHex(child.privateKey).toUpperCase()}`;
    const publicKey = bytesToHex(child.publicKey).toUpperCase();
    return { privateKey, publicKey, address: deriveAddress(publicKey), algorithm: 'secp256k1' };
  } finally {
    root.wipePrivateData();
  }
}

/**
 * Convenience wrapper for a single account.
 *
 * Turning the phrase into a master seed is PBKDF2 with 2048 rounds of
 * HMAC-SHA512 — cheap next to Argon2id, but not free, and it does not depend on
 * the account index. Callers deriving several accounts should compute the seed
 * once with `mnemonicToMasterSeed` and call `deriveFromMasterSeed` per account
 * rather than paying for it per account.
 */
export async function deriveFromMnemonic(mnemonic: string, index: number): Promise<Keypair> {
  const masterSeed = await mnemonicToMasterSeed(mnemonic);
  try {
    return deriveFromMasterSeed(masterSeed, index);
  } finally {
    wipe(masterSeed);
  }
}

/**
 * Reconstructs the keypair for an account already recorded in the vault.
 * Imported accounts carry an XRPL family seed whose prefix selects the curve.
 */
export async function deriveFromSource(
  source: AccountSource,
  mnemonic: string | null,
): Promise<Keypair> {
  if (source.kind === 'ownPhrase') {
    return deriveFromMnemonic(source.mnemonic, 0);
  }
  if (source.kind === 'derived') {
    if (!mnemonic) {
      throw new Error('This wallet has no recovery phrase, so derived accounts cannot be restored.');
    }
    return deriveFromMnemonic(mnemonic, source.index);
  }
  if (source.kind === 'external') {
    throw new Error('This wallet is held in another app, so no key can be derived for it here.');
  }
  return keypairFromFamilySeed(source.seed);
}

export function keypairFromFamilySeed(seed: string): Keypair {
  const algorithm = familySeedAlgorithm(seed);
  const keypair = deriveKeypair(seed, {
    algorithm: algorithm === 'ed25519' ? 'ed25519' : 'ecdsa-secp256k1',
  });
  return {
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
    address: deriveAddress(keypair.publicKey),
    algorithm,
  };
}

/**
 * Reads the curve out of the seed's own encoding. Guessing wrong here silently
 * produces a valid keypair for a different address, so the prefix is the only
 * acceptable source of truth.
 */
export function familySeedAlgorithm(seed: string): KeyAlgorithm {
  const { type } = decodeSeed(seed);
  return type === 'ed25519' ? 'ed25519' : 'secp256k1';
}

export function isValidFamilySeed(seed: string): boolean {
  try {
    decodeSeed(seed);
    return true;
  } catch {
    return false;
  }
}
