import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  isHex,
  timingSafeEqual,
  wipe,
} from '@/ledgerly/core/crypto/bytes';
import { randomBytes, randomInt, shuffle } from '@/ledgerly/core/crypto/random';
import { open, seal } from '@/ledgerly/core/crypto/aead';
import { DEFAULT_KDF_PARAMS, assertKdfParams, deriveVaultKey } from '@/ledgerly/core/crypto/kdf';

const TEST_KDF = { ...DEFAULT_KDF_PARAMS, m: 19456, t: 2 };

describe('readiness: crypto primitives', () => {
  it('T01 base64 round-trips arbitrary bytes', () => {
    for (let i = 0; i < 200; i += 1) {
      const bytes = randomBytes(1 + (i % 97));
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it('T02 hex detection rejects malformed input', () => {
    expect(isHex('00ff')).toBe(true);
    expect(isHex('00f')).toBe(false);
    expect(isHex('zz')).toBe(false);
    expect(isHex('00ff00ff')).toBe(true);
  });

  it('T03 wipe zeroes every buffer it is given', () => {
    const a = randomBytes(32);
    const b = randomBytes(16);
    wipe(a, b, null, undefined);
    expect(a.every((byte) => byte === 0)).toBe(true);
    expect(b.every((byte) => byte === 0)).toBe(true);
  });

  it('T04 constant-time compare matches value equality', () => {
    const a = randomBytes(32);
    const same = Uint8Array.from(a);
    const different = Uint8Array.from(a);
    different[7] = (different[7]! + 1) % 256;
    expect(timingSafeEqual(a, same)).toBe(true);
    expect(timingSafeEqual(a, different)).toBe(false);
    expect(timingSafeEqual(a, randomBytes(31))).toBe(false);
  });

  it('T05 randomBytes never repeats across draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(bytesToBase64(randomBytes(16)));
    expect(seen.size).toBe(500);
  });

  it('T06 randomInt stays in range and covers the space', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i += 1) {
      const value = randomInt(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
      seen.add(value);
    }
    expect(seen.size).toBe(10);
  });

  it('T07 shuffle is a permutation and does not mutate the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const out = shuffle(input);
    expect([...out].sort((a, b) => a - b)).toEqual([...input]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('T08 AEAD round-trips and rejects a wrong key', async () => {
    const key = randomBytes(32);
    const plaintext = randomBytes(128);
    const aad = randomBytes(24);
    const box = await seal(key, plaintext, aad);
    expect(await open(key, box, aad)).toEqual(plaintext);
    expect(await open(randomBytes(32), box, aad)).toBeNull();
  });

  it('T09 AEAD rejects tampered ciphertext, nonce and associated data', async () => {
    const key = randomBytes(32);
    const aad = new Uint8Array([1, 2, 3]);
    const box = await seal(key, new Uint8Array([9, 9, 9, 9]), aad);
    const flipped = base64ToBytes(box.ciphertext);
    flipped[0] = (flipped[0]! + 1) % 256;
    expect(await open(key, { ...box, ciphertext: bytesToBase64(flipped) }, aad)).toBeNull();
    expect(await open(key, { ...box, iv: bytesToBase64(randomBytes(12)) }, aad)).toBeNull();
    expect(await open(key, box, new Uint8Array([1, 2, 4]))).toBeNull();
    expect(await open(key, { ...box, iv: bytesToBase64(randomBytes(11)) }, aad)).toBeNull();
  });

  it('T10 AEAD nonces are unique per seal', async () => {
    const key = randomBytes(32);
    const nonces = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      nonces.add((await seal(key, new Uint8Array([1]), new Uint8Array())).iv);
    }
    expect(nonces.size).toBe(50);
  });

  it('T11 KDF rejects downgraded parameters', () => {
    expect(() => assertKdfParams(DEFAULT_KDF_PARAMS)).not.toThrow();
    expect(() => assertKdfParams({ ...DEFAULT_KDF_PARAMS, m: 1024 })).toThrow();
    expect(() => assertKdfParams({ ...DEFAULT_KDF_PARAMS, t: 0 })).toThrow();
    expect(() => assertKdfParams({ ...DEFAULT_KDF_PARAMS, p: 9 })).toThrow();
    expect(() => assertKdfParams({ ...DEFAULT_KDF_PARAMS, version: 0x10 })).toThrow();
    expect(() =>
      assertKdfParams({ ...DEFAULT_KDF_PARAMS, algorithm: 'pbkdf2' as unknown as 'argon2id' }),
    ).toThrow();
  });

  it('T12 KDF is deterministic, salt-separated and refuses short salts', async () => {
    const salt = randomBytes(16);
    const a = await deriveVaultKey('correct horse battery', salt, TEST_KDF);
    const b = await deriveVaultKey('correct horse battery', salt, TEST_KDF);
    const other = await deriveVaultKey('correct horse battery', randomBytes(16), TEST_KDF);
    const wrongPassword = await deriveVaultKey('correct horse batteru', salt, TEST_KDF);
    expect(a).toEqual(b);
    expect(a.length).toBe(32);
    expect(timingSafeEqual(a, other)).toBe(false);
    expect(timingSafeEqual(a, wrongPassword)).toBe(false);
    await expect(deriveVaultKey('x', randomBytes(8), TEST_KDF)).rejects.toThrow();
  });
});
