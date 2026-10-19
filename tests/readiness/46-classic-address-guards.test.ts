/**
 * Pins classic-address acceptance and the ingest-guard strings that depend on
 * regular expressions. Later sharing or hoisting of those patterns must keep
 * every case, including a second call on the same input.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { walletEventInput } from '@/lib/activity-input';
import {
  boundedText,
  isLedgerAddress,
  isLedgerCurrency,
  safeImageUrl,
  searchTerm,
} from '@/lib/ingest-guards';
import { recallName } from '@/ledgerly/ui/name-memory';

const shortest = `r${'1'.repeat(24)}`;
const longest = `r${'1'.repeat(34)}`;
const known = 'rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w';

const event = {
  kind: 'wallet_created' as const,
  network: 'mainnet' as const,
  signerKey: '00000000-0000-4000-8000-000000000001',
  fingerprint: 'a'.repeat(64),
};

class MemoryStorage {
  private map = new Map<string, string>();
  getItem = (key: string) => this.map.get(key) ?? null;
  setItem = (key: string, value: string) => void this.map.set(key, value);
  removeItem = (key: string) => void this.map.delete(key);
}

describe('classic address shape', () => {
  it('accepts 24 to 34 alphabet characters and rejects the edges around that', () => {
    for (const address of [shortest, longest, known]) {
      expect(isLedgerAddress(address)).toBe(true);
      expect(isLedgerAddress(address)).toBe(true);
      expect(walletEventInput.safeParse({ ...event, address }).success).toBe(true);
    }
    for (const address of [
      `r${'1'.repeat(23)}`,
      `r${'1'.repeat(35)}`,
      `r0${'1'.repeat(23)}`,
      `rO${'1'.repeat(23)}`,
      `rI${'1'.repeat(23)}`,
      `rl${'1'.repeat(23)}`,
      known.toLowerCase(),
      `${known} `,
      '',
    ]) {
      expect(isLedgerAddress(address)).toBe(false);
      const parsed = walletEventInput.safeParse({ ...event, address });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((issue) => issue.path[0] === 'address')).toBe(true);
      }
    }
    expect(walletEventInput.safeParse(event).success).toBe(true);
  });

  it('keeps a single copy of the classic address pattern', () => {
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
    const guards = read('src/lib/ingest-guards.ts');
    expect(guards).toContain('export const CLASSIC_ADDRESS_PATTERN');
    for (const file of [
      'src/lib/activity-input.ts',
      'src/lib/joey-auth.functions.ts',
      'src/ledgerly/ui/name-memory.ts',
    ]) {
      expect(read(file)).not.toContain('[1-9A-HJ-NP-Za-km-z]');
    }
  });

  it('drops a stored label whose key is not a classic address', () => {
    const storage = new MemoryStorage();
    (globalThis as { window?: unknown }).window = { localStorage: storage };
    storage.setItem(
      'ledgerly.wallet-names',
      JSON.stringify({ 'not-an-address': 'Sneaky', [known]: 'Rent money' }),
    );
    expect(recallName(known)).toBe('Rent money');
    expect(recallName('not-an-address')).toBeNull();
    delete (globalThis as { window?: unknown }).window;
  });
});

describe('ingest guard patterns stay stable across calls', () => {
  it('accepts a 3 character code and a 40 character hex code', () => {
    expect(isLedgerCurrency('USD')).toBe(true);
    expect(isLedgerCurrency('534F4C4F00000000000000000000000000000000')).toBe(true);
    expect(isLedgerCurrency('US')).toBe(false);
    expect(isLedgerCurrency('USDD')).toBe(false);
  });

  it('strips controls once and the same way on the next call', () => {
    const dirty = 'a\u0000b\u200bc\u202ed';
    expect(boundedText(dirty, 10)).toBe('a b c d');
    expect(boundedText(dirty, 10)).toBe('a b c d');
    expect(boundedText('   ', 8)).toBeNull();
    expect(boundedText('hello', 3)).toBe('hel');
  });

  it('keeps only search-term characters, twice', () => {
    expect(searchTerm('a_b%c,d')).toBe('abcd');
    expect(searchTerm('a_b%c,d')).toBe('abcd');
    expect(searchTerm('  ok-name  ')).toBe('ok-name');
  });

  it('rejects the same unsafe image URLs', () => {
    expect(safeImageUrl('https://cdn.example.com/logo.png')).toBe(
      'https://cdn.example.com/logo.png',
    );
    expect(safeImageUrl('https://cdn.example.com/logo.svg')).toBeNull();
    expect(safeImageUrl('https://cdn.example.com/logo.SVG')).toBeNull();
    expect(safeImageUrl('https://localhost/a.png')).toBeNull();
    expect(safeImageUrl('http://cdn.example.com/a.png')).toBeNull();
    expect(safeImageUrl('https://user:pass@cdn.example.com/a.png')).toBeNull();
    expect(safeImageUrl('https://cdn.example.com/logo.png')).toBe(
      'https://cdn.example.com/logo.png',
    );
  });
});
