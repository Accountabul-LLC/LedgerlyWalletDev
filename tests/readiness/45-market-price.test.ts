/**
 * Pins the USD labels both phone apps already show on market rows.
 * The formatter is display-only and must keep these exact strings.
 */
import { describe, expect, it } from 'vitest';
import { marketPrice as sharedPrice } from '@/ledgerly/native/market-format';
import { marketPrice as productionPrice } from '../../mobile/src/market-format';
import { marketPrice as developmentPrice } from '../../apps/mobile/src/market-format';

const samples: Array<string | null> = [
  null,
  '',
  'nope',
  'NaN',
  'Infinity',
  '-Infinity',
  '0',
  '0.5',
  '0.1234567',
  '0.000001',
  '0.0000001',
  '0.00000099',
  '1',
  '1.2',
  '1.239',
  '1000.5',
  '-2.5',
  '1e2',
  ' 1.5 ',
  '0.0000015',
];

const expected: Record<string, string> = {
  null: '—',
  '': '$0.00',
  nope: '—',
  NaN: '—',
  Infinity: '—',
  '-Infinity': '—',
  '0': '$0.00',
  '0.5': '$0.50',
  '0.1234567': '$0.123457',
  '0.000001': '$0.000001',
  '0.0000001': '$1.00e-7',
  '0.00000099': '$9.90e-7',
  '1': '$1.00',
  '1.2': '$1.20',
  '1.239': '$1.24',
  '1000.5': '$1,000.50',
  '-2.5': '-$2.50',
  '1e2': '$100.00',
  ' 1.5 ': '$1.50',
  '0.0000015': '$0.000002',
};

describe('phone market price labels', () => {
  it('formats the same USD strings in production and development', () => {
    expect(productionPrice).toBe(sharedPrice);
    expect(developmentPrice).toBe(sharedPrice);
    for (const sample of samples) {
      const key = sample === null ? 'null' : sample;
      expect(productionPrice(sample)).toBe(expected[key]);
      expect(developmentPrice(sample)).toBe(expected[key]);
    }
  });
});
