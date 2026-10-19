import { describe, expect, it } from 'vitest';
import {
  createMnemonic,
  isValidMnemonic,
  mnemonicToMasterSeed,
  mnemonicWordCount,
  normalizeMnemonic,
  suggestWords,
} from '@/ledgerly/core/keyring/mnemonic';
import {
  derivationPath,
  deriveFromMasterSeed,
  deriveFromMnemonic,
  isValidFamilySeed,
  keypairFromFamilySeed,
} from '@/ledgerly/core/keyring/derive';
import { isValidAddress } from '@/ledgerly/core/xrpl/address';

describe('readiness: keyring and derivation', () => {
  it('T13 generated phrases are valid and unique', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const phrase = createMnemonic();
      expect(isValidMnemonic(phrase)).toBe(true);
      expect(mnemonicWordCount(phrase)).toBeGreaterThanOrEqual(12);
      seen.add(phrase);
    }
    expect(seen.size).toBe(25);
  });

  it('T14 invalid phrases are rejected', () => {
    expect(isValidMnemonic('not a real mnemonic at all friend')).toBe(false);
    expect(isValidMnemonic('')).toBe(false);
    // A fixed valid phrase with one word swapped. Mutating a freshly generated
    // phrase is a coin flip: a 12 word checksum is 4 bits, so a random swap
    // still validates about one time in sixteen.
    const valid = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
    expect(isValidMnemonic(valid)).toBe(true);
    expect(isValidMnemonic(valid.replace(/yellow$/, 'zoo'))).toBe(false);
  });

  it('T15 normalisation collapses whitespace and case', () => {
    const phrase = createMnemonic();
    const messy = `  ${phrase.toUpperCase().split(' ').join('   ')}  `;
    expect(normalizeMnemonic(messy)).toBe(phrase);
    expect(isValidMnemonic(normalizeMnemonic(messy))).toBe(true);
  });

  it('T16 word suggestions are prefix matches from the wordlist', () => {
    const suggestions = suggestWords('aba', 5);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const word of suggestions) expect(word.startsWith('aba')).toBe(true);
    expect(suggestWords('zzzzz', 5)).toEqual([]);
  });

  it('T17 master seed derivation is deterministic and passphrase separated', async () => {
    const phrase = createMnemonic();
    const a = await mnemonicToMasterSeed(phrase);
    const b = await mnemonicToMasterSeed(phrase);
    const withPass = await mnemonicToMasterSeed(phrase, 'extra');
    expect(a).toEqual(b);
    expect(a).not.toEqual(withPass);
  });

  it('T18 derivation paths follow BIP44 with the XRPL coin type', () => {
    expect(derivationPath(0)).toBe("m/44'/144'/0'/0/0");
    expect(derivationPath(3)).toContain("144'");
  });

  it('T19 derived accounts are valid, deterministic and distinct per index', async () => {
    const phrase = createMnemonic();
    const first = await deriveFromMnemonic(phrase, 0);
    const firstAgain = await deriveFromMnemonic(phrase, 0);
    const second = await deriveFromMnemonic(phrase, 1);
    expect(first.address).toBe(firstAgain.address);
    expect(first.address).not.toBe(second.address);
    expect(isValidAddress(first.address)).toBe(true);
    expect(first.address.startsWith('r')).toBe(true);
  });

  it('T20 a different phrase never yields the same account', async () => {
    const addresses = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      addresses.add((await deriveFromMnemonic(createMnemonic(), 0)).address);
    }
    expect(addresses.size).toBe(10);
  });

  it('T21 master-seed derivation matches mnemonic derivation', async () => {
    const phrase = createMnemonic();
    const masterSeed = await mnemonicToMasterSeed(phrase);
    expect(deriveFromMasterSeed(masterSeed, 2).address).toBe(
      (await deriveFromMnemonic(phrase, 2)).address,
    );
  });

  it('T22 family seeds validate and import to a valid account', () => {
    const seed = 'snoPBrXtMeMyMHUVTgbuqAfg1SUTb';
    expect(isValidFamilySeed(seed)).toBe(true);
    expect(isValidFamilySeed('not-a-seed')).toBe(false);
    expect(isValidFamilySeed('')).toBe(false);
    const keypair = keypairFromFamilySeed(seed);
    expect(isValidAddress(keypair.address)).toBe(true);
    expect(keypairFromFamilySeed(seed).address).toBe(keypair.address);
    expect(() => keypairFromFamilySeed('garbage')).toThrow();
  });
});
