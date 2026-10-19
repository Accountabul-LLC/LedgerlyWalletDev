import { randomBytes } from './random';

const ALGORITHM = 'AES-GCM';
const IV_BYTES = 12;
const TAG_BITS = 128;

export interface SealedBox {
  /** Base64 nonce, freshly generated for every seal. */
  readonly iv: string;
  /** Base64 ciphertext with the appended authentication tag. */
  readonly ciphertext: string;
}

/**
 * WebCrypto is preferred over a JavaScript AES implementation here: the key
 * stays inside a non-extractable CryptoKey, and the browser's implementation is
 * the one hardened against timing and cache side channels.
 */
async function importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  if (keyBytes.length !== 32) {
    throw new Error('AES-GCM key must be 32 bytes');
  }
  return crypto.subtle.importKey('raw', keyBytes as BufferSource, ALGORITHM, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Encrypts with associated data. Callers bind the vault header — version and
 * KDF cost — into `associatedData` so that tampering with those fields makes
 * decryption fail rather than silently changing how the key was derived.
 */
export async function seal(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
  associatedData: Uint8Array,
): Promise<SealedBox> {
  const key = await importKey(keyBytes);
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource, additionalData: associatedData as BufferSource, tagLength: TAG_BITS },
    key,
    plaintext as BufferSource,
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Returns null when authentication fails, so callers cannot mistake a forged box for valid data. */
export async function open(
  keyBytes: Uint8Array,
  box: SealedBox,
  associatedData: Uint8Array,
): Promise<Uint8Array | null> {
  const key = await importKey(keyBytes);
  const iv = fromBase64(box.iv);
  if (iv.length !== IV_BYTES) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv as BufferSource, additionalData: associatedData as BufferSource, tagLength: TAG_BITS },
      key,
      fromBase64(box.ciphertext) as BufferSource,
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] as number);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
