import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes } from '@/ledgerly/core/crypto/bytes';
import {
  DEFAULT_KDF_PARAMS,
  assertKdfParams,
  deriveVaultKey as deriveJavaScriptKey,
  type KdfParams,
} from '@/ledgerly/core/crypto/kdf';
import {
  DEFAULT_KDF_PARAMS as phoneDefaults,
  assertKdfParams as phoneAssert,
  deriveVaultKey as derivePhoneKey,
  setNativeArgon2ForTests,
  type NativeArgon2Hash,
} from '../../mobile/src/nativeKdf';

// Minimum accepted Argon2id profile. Output checked against @noble/hashes.
const PARAMS: KdfParams = { algorithm: 'argon2id', m: 19456, t: 2, p: 1, version: 0x13 };
const PASSWORD = 'correct horse battery';
const SALT = new Uint8Array(16).fill(0x11);
const KNOWN_KEY = '2e4edb32049e90e5be57546980f7c347d39acbc108af6b59ff5dfd9f888a0348';

function faithfulHash(
  algorithm: string,
  message: ArrayBuffer,
  nonce: ArrayBuffer,
  parallelism: number,
  tagLength: number,
  memory: number,
  passes: number,
  version: number,
): Promise<Uint8Array> | Uint8Array {
  if (algorithm !== 'argon2id' || tagLength !== 32) return new Uint8Array(32);
  const password = new Uint8Array(message);
  const salt = new Uint8Array(nonce);
  return argon2idAsync(password, salt, {
    m: memory,
    t: passes,
    p: parallelism,
    version,
    dkLen: tagLength,
  }).then(
    (key) => key,
    () => new Uint8Array(32),
  );
}

describe('phone native Argon2id', () => {
  it('re-exports the shared parameters the vault imports from the redirected module', () => {
    expect(phoneDefaults).toEqual(DEFAULT_KDF_PARAMS);
    expect(phoneDefaults).toMatchObject({
      algorithm: 'argon2id',
      m: 47104,
      t: 1,
      p: 1,
      version: 0x13,
    });
    expect(phoneAssert).toBe(assertKdfParams);
    const app = JSON.parse(readFileSync(resolve('mobile/app.json'), 'utf8')) as {
      expo: { plugins: unknown[] };
    };
    expect(app.expo.plugins).toContain('react-native-quick-crypto');
    const dependencies = JSON.parse(readFileSync(resolve('mobile/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(dependencies.dependencies['react-native-quick-crypto']).toBe('1.1.8');
    expect(dependencies.dependencies['react-native-nitro-modules']).toBe('0.37.1');
    expect(dependencies.dependencies['react-native-quick-base64']).toBe('3.0.0');
  });

  it('matches the JavaScript key for a known vector, including a raw native result and a thrown native call', async () => {
    const expected = await deriveJavaScriptKey(PASSWORD, SALT, PARAMS);
    expect(bytesToHex(expected)).toBe(KNOWN_KEY);

    let nativeCalls = 0;
    const faithful: NativeArgon2Hash = {
      hash(...args) {
        nativeCalls += 1;
        return faithfulHash(...args);
      },
    };
    setNativeArgon2ForTests(faithful);
    try {
      expect(await derivePhoneKey(PASSWORD, SALT, PARAMS)).toEqual(expected);
      expect(nativeCalls).toBe(1);

      const combining = 'A\u030A';
      const normalized = await deriveJavaScriptKey(combining, SALT, PARAMS);
      expect(await derivePhoneKey(combining, SALT, PARAMS)).toEqual(normalized);
      expect(nativeCalls).toBe(2);

      const fractions: number[] = [];
      nativeCalls = 0;
      expect(
        await derivePhoneKey(PASSWORD, SALT, PARAMS, {
          onProgress: (fraction) => fractions.push(fraction),
        }),
      ).toEqual(expected);
      expect(fractions).toEqual([1]);

      nativeCalls = 0;
      setNativeArgon2ForTests({
        hash() {
          nativeCalls += 1;
          return hexToBytes(KNOWN_KEY);
        },
      });
      expect(await derivePhoneKey(PASSWORD, SALT, PARAMS)).toEqual(expected);
      expect(nativeCalls).toBe(1);

      nativeCalls = 0;
      setNativeArgon2ForTests({
        hash() {
          nativeCalls += 1;
          throw new TypeError('undefined is not a function');
        },
      });
      expect(await derivePhoneKey(PASSWORD, SALT, PARAMS)).toEqual(expected);
      expect(nativeCalls).toBe(1);

      nativeCalls = 0;
      setNativeArgon2ForTests({
        hash() {
          nativeCalls += 1;
          return Promise.reject(new TypeError('undefined is not a function'));
        },
      });
      expect(await derivePhoneKey(PASSWORD, SALT, PARAMS)).toEqual(expected);
      expect(nativeCalls).toBe(1);

      setNativeArgon2ForTests(null);
      expect(await derivePhoneKey(PASSWORD, SALT, PARAMS)).toEqual(expected);
    } finally {
      setNativeArgon2ForTests(undefined);
    }
    // Several Argon2id derivations; a quiet runner finishes near 22s and a busy one exceeds 30s.
  }, 60_000);

  it('keeps a caller progress error from being treated as a native failure', async () => {
    let nativeCalls = 0;
    setNativeArgon2ForTests({
      hash() {
        nativeCalls += 1;
        return hexToBytes(KNOWN_KEY);
      },
    });
    try {
      await expect(
        derivePhoneKey(PASSWORD, SALT, PARAMS, {
          onProgress() {
            throw new Error('ui');
          },
        }),
      ).rejects.toThrow('ui');
      expect(nativeCalls).toBe(1);
    } finally {
      setNativeArgon2ForTests(undefined);
    }
  });
});
