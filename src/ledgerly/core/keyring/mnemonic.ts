import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/**
 * 256 bits of entropy, giving a 24-word phrase. 12 words is also safe, but the
 * recovery phrase is the single point of failure for every account in the
 * wallet and the extra words cost the user nothing after setup.
 */
const ENTROPY_BITS = 256;

export function createMnemonic(): string {
  return generateMnemonic(wordlist, ENTROPY_BITS);
}

export function isValidMnemonic(phrase: string): boolean {
  return validateMnemonic(normalizeMnemonic(phrase), wordlist);
}

/** Collapses the whitespace and casing differences that arise from copy-paste. */
export function normalizeMnemonic(phrase: string): string {
  return phrase.normalize('NFKD').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function mnemonicToMasterSeed(phrase: string, passphrase = ''): Promise<Uint8Array> {
  const normalized = normalizeMnemonic(phrase);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error('That recovery phrase is not valid. Check the spelling and word order.');
  }
  return mnemonicToSeed(normalized, passphrase);
}

/** Words matching a prefix, for the import screen's autocomplete. */
export function suggestWords(prefix: string, limit = 5): string[] {
  const needle = prefix.trim().toLowerCase();
  if (needle.length < 2) return [];
  const matches: string[] = [];
  for (const word of wordlist) {
    if (word.startsWith(needle)) {
      matches.push(word);
      if (matches.length === limit) break;
    }
  }
  return matches;
}

export function mnemonicWordCount(phrase: string): number {
  const normalized = normalizeMnemonic(phrase);
  return normalized.length === 0 ? 0 : normalized.split(' ').length;
}
