/**
 * A focused WebCrypto stand-in for React Native.
 *
 * Ledgerly core encrypts the vault with AES-GCM through `crypto.subtle` so the
 * key can stay non-extractable in browsers. Hermes does not implement SubtleCrypto,
 * so the phone host supplies the same algorithms with @noble/ciphers (AES-GCM)
 * and @noble/hashes (SHA-256). Randomness is injected by the host — Expo Crypto
 * on device, WebCrypto in tests — never Math.random.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';

export interface RandomSource {
  getRandomValues(array: ArrayBufferView): ArrayBufferView;
}

type AesKey = {
  readonly type: 'secret';
  readonly algorithm: { name: 'AES-GCM' };
  readonly extractable: false;
  readonly usages: KeyUsage[];
  readonly bytes: Uint8Array;
};

function toBytes(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new TypeError('expected a BufferSource');
}

function algorithmName(algorithm: AlgorithmIdentifier): string {
  return typeof algorithm === 'string' ? algorithm : algorithm.name;
}

export function createSubtlePolyfill(): SubtleCrypto {
  return {
    async importKey(format, keyData, algorithm, _extractable, keyUsages) {
      if (format !== 'raw') throw new Error('only raw AES-GCM keys are supported');
      if (algorithmName(algorithm) !== 'AES-GCM') {
        throw new Error('only AES-GCM is supported');
      }
      const bytes = toBytes(keyData as BufferSource);
      if (bytes.length !== 32) throw new Error('AES-GCM key must be 32 bytes');
      const key: AesKey = {
        type: 'secret',
        algorithm: { name: 'AES-GCM' },
        extractable: false,
        usages: [...keyUsages],
        bytes,
      };
      return key as unknown as CryptoKey;
    },

    async encrypt(algorithm, key, data) {
      const params = algorithm as AesGcmParams;
      if (algorithmName(algorithm) !== 'AES-GCM') {
        throw new Error('only AES-GCM is supported');
      }
      const secret = key as unknown as AesKey;
      const nonce = toBytes(params.iv as BufferSource);
      const aad = params.additionalData
        ? toBytes(params.additionalData as BufferSource)
        : undefined;
      const cipher = gcm(secret.bytes, nonce, aad);
      return cipher.encrypt(toBytes(data)).buffer as ArrayBuffer;
    },

    async decrypt(algorithm, key, data) {
      const params = algorithm as AesGcmParams;
      if (algorithmName(algorithm) !== 'AES-GCM') {
        throw new Error('only AES-GCM is supported');
      }
      const secret = key as unknown as AesKey;
      const nonce = toBytes(params.iv as BufferSource);
      const aad = params.additionalData
        ? toBytes(params.additionalData as BufferSource)
        : undefined;
      try {
        const cipher = gcm(secret.bytes, nonce, aad);
        return cipher.decrypt(toBytes(data)).buffer as ArrayBuffer;
      } catch {
        throw new Error('The operation failed for an operation-specific reason');
      }
    },

    async digest(algorithm, data) {
      if (algorithmName(algorithm) !== 'SHA-256') {
        throw new Error('only SHA-256 is supported');
      }
      return sha256(toBytes(data)).buffer as ArrayBuffer;
    },
  } as SubtleCrypto;
}

export function installLedgerlyCrypto(
  random: RandomSource,
  options: { force?: boolean } = {},
): void {
  const existing = globalThis.crypto as Crypto | undefined;
  if (existing?.subtle && !options.force) return;

  const subtle = existing?.subtle && !options.force ? existing.subtle : createSubtlePolyfill();
  const crypto = {
    getRandomValues: <T extends ArrayBufferView>(array: T): T => random.getRandomValues(array) as T,
    subtle,
    randomUUID: () => {
      const bytes = new Uint8Array(16);
      random.getRandomValues(bytes);
      bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
      bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  } as Crypto;

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    enumerable: true,
    value: crypto,
  });
}
