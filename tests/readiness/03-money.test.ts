import { describe, expect, it } from 'vitest';
import {
  MAX_DROPS,
  addDrops,
  assertIssuedPrecision,
  compareDecimal,
  currencyToDisplay,
  currencyToHex,
  dropsToXrp,
  formatAmount,
  isDecimalString,
  isValidCurrencyCode,
  subtractDropsToZero,
  xrpToDrops,
} from '@/ledgerly/core/xrpl/amount';

describe('readiness: money handling', () => {
  it('T23 XRP to drops is exact at the precision boundary', () => {
    expect(xrpToDrops('1')).toBe('1000000');
    expect(xrpToDrops('0.000001')).toBe('1');
    expect(xrpToDrops(' 12.5 ')).toBe('12500000');
    expect(xrpToDrops('0.1')).toBe('100000');
  });

  it('T24 XRP to drops rejects bad, negative, over-precise and oversized input', () => {
    expect(() => xrpToDrops('abc')).toThrow();
    expect(() => xrpToDrops('')).toThrow();
    expect(() => xrpToDrops('-1')).toThrow();
    expect(() => xrpToDrops('1.0000001')).toThrow();
    expect(() => xrpToDrops('1e6')).toThrow();
    expect(() => xrpToDrops('200000000000')).toThrow();
  });

  it('T25 drops to XRP round-trips without floating point drift', () => {
    for (const value of ['0', '1', '0.000001', '0.1', '99999999999.999999', '1234.567891']) {
      expect(dropsToXrp(xrpToDrops(value))).toBe(
        Number(value) === 0 ? dropsToXrp('0') : dropsToXrp(xrpToDrops(value)),
      );
      expect(xrpToDrops(dropsToXrp(xrpToDrops(value)))).toBe(xrpToDrops(value));
    }
    expect(BigInt(xrpToDrops('100000000000'))).toBe(MAX_DROPS);
  });

  it('T26 decimal comparison and formatting behave like arbitrary precision', () => {
    expect(compareDecimal('0.30000000000000004', '0.3')).toBe(1);
    expect(compareDecimal('10', '9.999999')).toBe(1);
    expect(compareDecimal('1.0', '1')).toBe(0);
    expect(compareDecimal('-5', '1')).toBe(-1);
    expect(isDecimalString('1.25')).toBe(true);
    expect(isDecimalString('1,25')).toBe(false);
    expect(formatAmount('1.2500000', 6)).not.toContain('e');
  });

  it('T27 drop arithmetic never goes negative', () => {
    expect(addDrops('1', '2')).toBe('3');
    expect(addDrops('999999', '1')).toBe('1000000');
    expect(subtractDropsToZero('5', '3')).toBe('2');
    expect(subtractDropsToZero('3', '5')).toBe('0');
  });

  it('T28 currency codes validate and a hex XRP lookalike never renders as XRP', () => {
    expect(isValidCurrencyCode('USD')).toBe(true);
    expect(isValidCurrencyCode('BAD CODE!!')).toBe(false);
    expect(isValidCurrencyCode('US')).toBe(false);
    expect(currencyToDisplay('USD')).toBe('USD');
    expect(currencyToHex('USD')).toBe('USD');
    const hexXrp = Buffer.from('XRP').toString('hex').toUpperCase().padEnd(40, '0');
    expect(currencyToDisplay(hexXrp)).not.toBe('XRP');
    expect(() => currencyToHex('BAD CODE!!')).toThrow();
  });

  it('T29 issued-token precision limits are enforced', () => {
    expect(() => assertIssuedPrecision('1.5')).not.toThrow();
    expect(() => assertIssuedPrecision('1.1234567890123456789')).toThrow();
  });

  it('T30 fuzz: amount parsing never throws unexpectedly or returns NaN', () => {
    const alphabet = '0123456789.-e ,';
    for (let i = 0; i < 3_000; i += 1) {
      let input = '';
      const length = 1 + Math.floor(Math.random() * 12);
      for (let j = 0; j < length; j += 1) {
        input += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      let drops: string | null = null;
      try {
        drops = xrpToDrops(input);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message.length).toBeGreaterThan(0);
      }
      if (drops !== null) {
        expect(/^\d+$/.test(drops)).toBe(true);
        expect(BigInt(drops) <= MAX_DROPS).toBe(true);
      }
    }
  });
});
