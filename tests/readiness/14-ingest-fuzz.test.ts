/**
 * Fuzzing for everything that crosses the wire into the app: a visitor's
 * search box and the third-party token feed.
 *
 * The invariant under test is that no input, however hostile, can produce a
 * value that carries meaning downstream. A search term can never contain a
 * character that the database filter grammar treats as syntax, a stored string
 * is always bounded, a stored image URL is always plain https, and a stored
 * number is always a real number inside its range.
 */
import { describe, expect, it } from 'vitest';
import {
  boundedInt,
  boundedText,
  isLedgerAddress,
  isLedgerCurrency,
  safeImageUrl,
  searchTerm,
} from '@/lib/ingest-guards';

const HOSTILE = [
  "'; DROP TABLE xrpl_tokens; --",
  '%,is_active.eq.false',
  'a,issuer.neq.null',
  'ticker.ilike.*',
  '() OR 1=1',
  '__proto__',
  'constructor',
  'prototype',
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '../../etc/passwd',
  '\u0000\u0007\u001b[31m',
  '\r\nSet-Cookie: a=b',
  '{{7*7}}',
  '${process.env}',
  'x'.repeat(10_000),
  '𝔘𝔫𝔦𝔠𝔬𝔡𝔢',
  '％２５',
];

const FUZZ_ALPHABET = 'abzAZ09 -_%,.:()[]{}<>\'"`;\\/|*?&=+#@!$^~\r\n\t\u0000\u200b𝔘é';

/** ASCII controls, zero-width characters, and bidi overrides that boundedText removes. */
function isStrippedControl(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    code <= 31 ||
    code === 127 ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function randomString(maxLength: number): string {
  let out = '';
  const length = Math.floor(Math.random() * maxLength);
  for (let i = 0; i < length; i += 1) {
    out += FUZZ_ALPHABET[Math.floor(Math.random() * FUZZ_ALPHABET.length)];
  }
  return out;
}

const NON_STRINGS: unknown[] = [
  null,
  undefined,
  0,
  -1,
  Number.NaN,
  Infinity,
  true,
  {},
  [],
  { toString: () => 'evil' },
  Symbol('s'),
  () => 'evil',
];

describe('readiness: hostile input handling', () => {
  it('T125 a search term never carries filter or wildcard syntax', () => {
    for (const value of HOSTILE) {
      expect(searchTerm(value)).toMatch(/^[A-Za-z0-9 -]*$/);
    }
    for (let i = 0; i < 5_000; i += 1) {
      const term = searchTerm(randomString(80));
      expect(term).toMatch(/^[A-Za-z0-9 -]*$/);
      expect(term).not.toMatch(/[_%]/);
      expect(term.length).toBeLessThanOrEqual(40);
    }
  });

  it('T126 a search term survives normal words unchanged', () => {
    expect(searchTerm('  Sologenic ')).toBe('Sologenic');
    expect(searchTerm('core-usd-1')).toBe('core-usd-1');
    expect(searchTerm('core-usd_1')).toBe('core-usd1');
    expect(searchTerm('100%_off')).toBe('100off');
  });

  it('T127 non-string search input is treated as no search at all', () => {
    for (const value of NON_STRINGS) expect(searchTerm(value)).toBe('');
  });

  it('T128 stored text is always bounded, single line and never empty string', () => {
    for (const value of [...HOSTILE, ...NON_STRINGS]) {
      const stored = boundedText(value, 64);
      if (stored === null) continue;
      expect(stored.length).toBeLessThanOrEqual(64);
      expect([...stored].some(isStrippedControl)).toBe(false);
      expect(stored.trim()).toBe(stored);
      expect(stored).not.toBe('');
    }
    for (let i = 0; i < 5_000; i += 1) {
      const stored = boundedText(randomString(500), 24);
      expect(stored === null || stored.length <= 24).toBe(true);
      if (stored !== null) expect([...stored].some(isStrippedControl)).toBe(false);
    }
  });

  it('T129 only plain https image URLs are ever stored', () => {
    expect(safeImageUrl('https://cdn.example.com/logo.png')).toBe(
      'https://cdn.example.com/logo.png',
    );
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==',
      'http://cdn.example.com/logo.png',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
      '//cdn.example.com/logo.png',
      `https://cdn.example.com/${'a'.repeat(600)}.png`,
      ...HOSTILE,
      ...NON_STRINGS,
    ]) {
      expect(safeImageUrl(value)).toBeNull();
    }
    for (let i = 0; i < 2_000; i += 1) {
      const url = safeImageUrl(randomString(120));
      expect(url === null || url.startsWith('https://')).toBe(true);
    }
  });

  it('T130 stored numbers are always finite and inside their range', () => {
    for (const value of [...HOSTILE, ...NON_STRINGS, '1e309', '-0', '9'.repeat(40)]) {
      const number = boundedInt(value, 0, 1_000);
      expect(Number.isFinite(number)).toBe(true);
      expect(Number.isInteger(number)).toBe(true);
      expect(number).toBeGreaterThanOrEqual(0);
      expect(number).toBeLessThanOrEqual(1_000);
    }
  });

  it('T131 only real ledger currency codes and addresses are accepted', () => {
    expect(isLedgerCurrency('USD')).toBe(true);
    expect(isLedgerCurrency('534F4C4F00000000000000000000000000000000')).toBe(true);
    expect(isLedgerAddress('rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w')).toBe(true);
    for (const value of [
      ...HOSTILE,
      ...NON_STRINGS,
      'US',
      'USDD',
      'r0OIl1111111111111111111111',
      'rShort',
      `r${'1'.repeat(60)}`,
    ]) {
      expect(isLedgerCurrency(value)).toBe(false);
      expect(isLedgerAddress(value)).toBe(false);
    }
    for (let i = 0; i < 5_000; i += 1) {
      const value = randomString(50);
      if (isLedgerAddress(value)) expect(value).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/);
      if (isLedgerCurrency(value)) expect(value.length === 3 || value.length === 40).toBe(true);
    }
  });

  it('T132 guards never throw, whatever they are handed', () => {
    for (let i = 0; i < 3_000; i += 1) {
      const value = Math.random() > 0.5 ? randomString(200) : NON_STRINGS[i % NON_STRINGS.length];
      expect(() => {
        searchTerm(value);
        boundedText(value, 32);
        safeImageUrl(value);
        boundedInt(value, -10, 10);
        isLedgerAddress(value);
        isLedgerCurrency(value);
      }).not.toThrow();
    }
  });
});
