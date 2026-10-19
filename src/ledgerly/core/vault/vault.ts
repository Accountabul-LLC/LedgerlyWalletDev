import { open, seal } from '../crypto/aead';
import { bytesToBase64, base64ToBytes, utf8ToBytes, wipe } from '../crypto/bytes';
import { DEFAULT_KDF_PARAMS, assertKdfParams, deriveVaultKey, type KdfParams } from '../crypto/kdf';
import { randomBytes } from '../crypto/random';
import { type VaultPayload, type VaultRecord, VAULT_VERSION, parsePayload } from './schema';

const SALT_BYTES = 16;

/**
 * Binds the header fields into the AEAD's associated data. Without this an
 * attacker who can write to storage could lower the KDF cost or swap the salt
 * and still present a box that decrypts once they brute-force the weakened
 * parameters; with it, any header edit turns into an authentication failure.
 */
function headerAad(version: number, kdf: KdfParams, salt: string): Uint8Array {
  return utf8ToBytes(
    JSON.stringify([version, kdf.algorithm, kdf.m, kdf.t, kdf.p, kdf.version, salt]),
  );
}

export interface CreatedVault {
  readonly record: VaultRecord;
  /**
   * The derived key, handed back so the caller can open a session without
   * paying for a second Argon2id derivation. Deliberately memory-hard, it costs
   * a noticeable fraction of a second — running it twice made wallet creation
   * visibly sluggish for no benefit. The caller owns wiping it.
   */
  readonly key: Uint8Array;
}

/** A vault keeps its identity across password changes; only the bytes rotate. */
export function newVaultId(): string {
  return bytesToBase64(randomBytes(12)).replace(/[^a-zA-Z0-9]/g, '');
}

export interface VaultIdentity {
  readonly id?: string;
  readonly generation?: number;
}

export async function createVault(
  password: string,
  payload: VaultPayload,
  kdf: KdfParams = DEFAULT_KDF_PARAMS,
  options?: VaultIdentity,
): Promise<CreatedVault> {
  assertKdfParams(kdf);
  const salt = randomBytes(SALT_BYTES);
  const saltB64 = bytesToBase64(salt);
  const key = await deriveVaultKey(password, salt, kdf);

  const plaintext = utf8ToBytes(JSON.stringify(payload));
  try {
    const box = await seal(key, plaintext, headerAad(VAULT_VERSION, kdf, saltB64));
    const now = Date.now();
    return {
      record: {
        version: VAULT_VERSION,
        id: options?.id ?? newVaultId(),
        generation: options?.generation ?? 1,
        kdf,
        salt: saltB64,
        iv: box.iv,
        ciphertext: box.ciphertext,
        createdAt: now,
        updatedAt: now,
      },
      key,
    };
  } catch (error) {
    wipe(key);
    throw error;
  } finally {
    wipe(plaintext);
  }
}

export interface UnlockResult {
  readonly payload: VaultPayload;
  /** Retained for the duration of the session so re-sealing does not re-run the KDF. */
  readonly key: Uint8Array;
}

/** Returns null on a wrong password; throws only when the vault itself is unusable. */
export async function unlockVault(record: VaultRecord, password: string): Promise<UnlockResult | null> {
  if (record.version > VAULT_VERSION) {
    throw new Error('This vault was created by a newer version of Ledgerly.');
  }
  assertKdfParams(record.kdf);

  const salt = base64ToBytes(record.salt);
  const key = await deriveVaultKey(password, salt, record.kdf);
  const plaintext = await open(
    key,
    { iv: record.iv, ciphertext: record.ciphertext },
    headerAad(record.version, record.kdf, record.salt),
  );

  if (!plaintext) {
    wipe(key);
    return null;
  }

  try {
    const payload = parsePayload(JSON.parse(new TextDecoder().decode(plaintext)));
    return { payload, key };
  } catch (error) {
    wipe(key);
    throw error;
  } finally {
    wipe(plaintext);
  }
}

/**
 * Re-seals with the session key and a fresh nonce. Reusing a nonce under the
 * same AES-GCM key is catastrophic, so the nonce always comes from `seal`.
 */
export async function resealVault(
  record: VaultRecord,
  key: Uint8Array,
  payload: VaultPayload,
): Promise<VaultRecord> {
  const plaintext = utf8ToBytes(JSON.stringify(payload));
  try {
    const box = await seal(key, plaintext, headerAad(record.version, record.kdf, record.salt));
    return {
      ...record,
      id: record.id ?? newVaultId(),
      generation: (record.generation ?? 0) + 1,
      iv: box.iv,
      ciphertext: box.ciphertext,
      updatedAt: Date.now(),
    };
  } finally {
    wipe(plaintext);
  }
}

/** Re-encrypts under a new password, which also rotates the salt and nonce. */
export async function changeVaultPassword(
  record: VaultRecord,
  currentPassword: string,
  nextPassword: string,
): Promise<CreatedVault | null> {
  const unlocked = await unlockVault(record, currentPassword);
  if (!unlocked) return null;
  try {
    // Same wallet, new bytes: keep the identity and move the generation on so
    // a tab holding the previous record cannot write over the new one.
    return await createVault(nextPassword, unlocked.payload, DEFAULT_KDF_PARAMS, {
      id: record.id ?? newVaultId(),
      generation: (record.generation ?? 0) + 1,
    });
  } finally {
    wipe(unlocked.key);
  }
}
