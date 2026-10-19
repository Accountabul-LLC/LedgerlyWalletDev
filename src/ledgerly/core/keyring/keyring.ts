import { Wallet } from 'xrpl';
import type { Transaction } from 'xrpl';
import { wipe } from '../crypto/bytes';
import type { StoredAccount, VaultPayload } from '../vault/schema';
import {
  deriveFromMasterSeed,
  deriveFromMnemonic,
  deriveFromSource,
  keypairFromFamilySeed,
  type Keypair,
} from './derive';
import { mnemonicToMasterSeed } from './mnemonic';

function deriveDerivedAccount(index: number, masterSeed: Uint8Array | null): Keypair {
  if (!masterSeed) {
    throw new Error('This wallet has no recovery phrase, so derived accounts cannot be restored.');
  }
  return deriveFromMasterSeed(masterSeed, index);
}

export interface SignedTransaction {
  readonly txBlob: string;
  readonly hash: string;
}

/**
 * Holds decrypted keys for the unlocked session.
 *
 * The keyring exposes signing, never key export. Callers outside the engine
 * receive signed blobs and addresses; there is deliberately no method that
 * returns a private key, so no message handler can be tricked into forwarding
 * one. Seed export is a separate, password-gated path on the engine.
 */
export class Keyring {
  private keys = new Map<string, Keypair>();
  /** Ids of wallets held in another app; listed so signing can refuse by name. */
  private external = new Set<string>();

  get isUnlocked(): boolean {
    return this.keys.size > 0;
  }

  /**
   * Rebuilds every account's keypair.
   *
   * The master seed is computed once and shared across accounts. Deriving it
   * per account meant paying PBKDF2 once per account on every unlock, which
   * grew the unlock time linearly with how many accounts the user had added.
   */
  async load(payload: VaultPayload): Promise<void> {
    this.wipe();
    const needsMasterSeed = payload.accounts.some((account) => account.source.kind === 'derived');
    const masterSeed =
      needsMasterSeed && payload.mnemonic ? await mnemonicToMasterSeed(payload.mnemonic) : null;

    try {
      for (const account of payload.accounts) {
        // Connected outside wallets hold no secret here, so nothing is derived
        // and nothing is stored: they can never be signed for locally.
        if (account.source.kind === 'external') {
          this.external.add(account.id);
          continue;
        }
        const keypair =
          account.source.kind === 'derived'
            ? deriveDerivedAccount(account.source.index, masterSeed)
            : account.source.kind === 'ownPhrase'
              ? await deriveFromMnemonic(account.source.mnemonic, 0)
              : keypairFromFamilySeed(account.source.seed);

        if (keypair.address !== account.address) {
          this.wipe();
          throw new Error(
            `Account ${account.label} did not reproduce its stored address. The vault may be corrupt.`,
          );
        }
        this.keys.set(account.id, keypair);
      }
    } finally {
      wipe(masterSeed);
    }
  }

  /** Adds a single account without reloading every key. */
  async add(account: StoredAccount, mnemonic: string | null): Promise<void> {
    if (account.source.kind === 'external') {
      this.external.add(account.id);
      return;
    }
    const keypair = await deriveFromSource(account.source, mnemonic);
    if (keypair.address !== account.address) {
      throw new Error('Derived address does not match the account record.');
    }
    this.keys.set(account.id, keypair);
  }

  remove(accountId: string): void {
    this.keys.delete(accountId);
    this.external.delete(accountId);
  }

  /** True when this wallet lives in another app and cannot be signed for here. */
  isExternal(accountId: string): boolean {
    return this.external.has(accountId);
  }

  publicKeyOf(accountId: string): string {
    return this.require(accountId).publicKey;
  }

  addressOf(accountId: string): string {
    return this.require(accountId).address;
  }

  /**
   * Signs a fully-formed transaction. The transaction is validated and
   * serialised by xrpl.js, which rejects unknown fields rather than signing
   * them, so a malformed request from a dApp cannot smuggle extra content into
   * the blob.
   */
  sign(accountId: string, transaction: Transaction): SignedTransaction {
    const keypair = this.require(accountId);
    const wallet = new Wallet(keypair.publicKey, keypair.privateKey);
    const { tx_blob: txBlob, hash } = wallet.sign(transaction);
    return { txBlob, hash };
  }

  wipe(): void {
    this.keys.clear();
    this.external.clear();
  }

  private require(accountId: string): Keypair {
    if (this.external.has(accountId)) {
      throw new Error('That wallet is held in another app. Approve the transaction there instead.');
    }
    const keypair = this.keys.get(accountId);
    if (!keypair) {
      throw new Error('The wallet is locked or that account is not available.');
    }
    return keypair;
  }
}
