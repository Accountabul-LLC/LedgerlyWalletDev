import { base64 } from '@scure/base';
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomValues,
  randomUUID,
  type GCMTagByteLength,
} from 'expo-crypto';

type ByteSource = ArrayBuffer | ArrayBufferView;
type ImportedKey = Awaited<ReturnType<typeof AESEncryptionKey.import>>;

interface AesGcmParams {
  readonly iv: ByteSource;
  readonly additionalData?: ByteSource;
  readonly tagLength?: number;
}

let installed = false;

/**
 * Installs only the WebCrypto subset used by Ledgerly core, backed by Expo's
 * native AES-GCM implementation. This keeps the upstream core source unchanged.
 */
export function installLedgerlyCryptoRuntime(): void {
  if (installed) return;

  if (typeof globalThis.btoa !== 'function') {
    Object.defineProperty(globalThis, 'btoa', {
      configurable: true,
      value: (value: string) =>
        base64.encode(Uint8Array.from(value, (character) => character.charCodeAt(0))),
    });
  }
  if (typeof globalThis.atob !== 'function') {
    Object.defineProperty(globalThis, 'atob', {
      configurable: true,
      value: (value: string) => bytesToBinaryString(base64.decode(value)),
    });
  }

  const subtle = {
    async importKey(
      format: string,
      keyData: ByteSource,
      algorithm: string | { name: string },
    ): Promise<ImportedKey> {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (format !== 'raw' || name !== 'AES-GCM')
        throw new Error('Unsupported native crypto operation.');
      return AESEncryptionKey.import(toBytes(keyData));
    },

    async encrypt(
      algorithm: AesGcmParams,
      key: ImportedKey,
      data: ByteSource,
    ): Promise<ArrayBuffer> {
      const tagLength = tagBytes(algorithm.tagLength);
      const sealed = await aesEncryptAsync(toBytes(data), key, {
        nonce: { bytes: toBytes(algorithm.iv) },
        tagLength,
        ...(algorithm.additionalData ? { additionalData: toBytes(algorithm.additionalData) } : {}),
      });
      const encrypted = await sealed.ciphertext({ encoding: 'bytes', includeTag: true });
      return exactBuffer(encrypted as Uint8Array);
    },

    async decrypt(
      algorithm: AesGcmParams,
      key: ImportedKey,
      data: ByteSource,
    ): Promise<ArrayBuffer> {
      const tagLength = tagBytes(algorithm.tagLength);
      const sealed = AESSealedData.fromParts(toBytes(algorithm.iv), toBytes(data), tagLength);
      const plaintext = await aesDecryptAsync(sealed, key, {
        output: 'bytes',
        ...(algorithm.additionalData ? { additionalData: toBytes(algorithm.additionalData) } : {}),
      });
      return exactBuffer(plaintext as Uint8Array);
    },
  };

  const current = Reflect.get(globalThis, 'crypto') as
    | { getRandomValues?: unknown; randomUUID?: unknown; subtle?: { importKey?: unknown } }
    | undefined;
  if (
    typeof current?.getRandomValues === 'function' &&
    typeof current.subtle?.importKey === 'function'
  ) {
    installed = true;
    return;
  }

  const runtime = { ...(current ?? {}), getRandomValues, randomUUID, subtle };
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: runtime });
  } catch {
    if (!current) throw new Error('Ledgerly could not install the native crypto runtime.');
    Object.defineProperties(current, {
      getRandomValues: { configurable: true, value: getRandomValues },
      randomUUID: { configurable: true, value: randomUUID },
      subtle: { configurable: true, value: subtle },
    });
  }
  installed = true;
}

function tagBytes(bits = 128): GCMTagByteLength {
  if (bits % 8 !== 0) throw new Error('AES-GCM tag length must be a whole number of bytes.');
  const bytes = bits / 8;
  if (
    bytes !== 16 &&
    bytes !== 15 &&
    bytes !== 14 &&
    bytes !== 13 &&
    bytes !== 12 &&
    bytes !== 8 &&
    bytes !== 4
  ) {
    throw new Error('Unsupported AES-GCM tag length.');
  }
  return bytes;
}

function toBytes(value: ByteSource): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function exactBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function bytesToBinaryString(value: Uint8Array): string {
  const chunkSize = 0x8000;
  let result = '';
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    result += String.fromCharCode(...value.subarray(offset, offset + chunkSize));
  }
  return result;
}
