/**
 * The public "value sent" total is only trustworthy if the same payment always
 * converts to the same dollar figure. These checks pin the three conversion
 * buckets, the rounding, and the refusal to guess at anything else.
 */
import { describe, expect, it } from 'vitest';
import { bucketFor, convertToUsd, MAX_ROW_USD } from '../../src/lib/pricing.server';

describe('readiness: value sent conversion', () => {
  it('T84 there are exactly three conversion buckets', () => {
    expect(bucketFor('XRP')).toBe('xrp');
    expect(bucketFor('xrp')).toBe('xrp');
    expect(bucketFor('USDC')).toBe('stable');
    expect(bucketFor('rlusd')).toBe('stable');
    expect(bucketFor('524C555344000000000000000000000000000000')).toBe('stable');
    expect(bucketFor('SOLO')).toBe('none');
    expect(bucketFor('')).toBe('none');
  });

  it('T85 the same payment always converts to the same figure', () => {
    const runs = Array.from({ length: 50 }, () => convertToUsd(123.456, 'XRP', 0.5217));
    expect(new Set(runs).size).toBe(1);
    expect(runs[0]).toBe(64.41);
  });

  it('T86 stablecoins are pinned at one dollar and never touch the rate', () => {
    expect(convertToUsd(10, 'USDC', 0.5)).toBe(10);
    expect(convertToUsd(10, 'USDC', null)).toBe(10);
    expect(convertToUsd(2.005, 'RLUSD', 999)).toBe(2.01);
  });

  it('T87 unpriceable assets count as zero rather than a guess', () => {
    expect(convertToUsd(1_000_000, 'SOLO', 0.5)).toBe(0);
    expect(convertToUsd(1_000_000, 'CSC', null)).toBe(0);
  });

  it('T88 a missing or broken rate never invents a value for XRP', () => {
    for (const price of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(convertToUsd(100, 'XRP', price)).toBe(0);
    }
  });

  it('T89 conversion is always a finite figure rounded to cents', () => {
    for (let i = 0; i < 500; i += 1) {
      const amount = Math.random() * 1_000_000;
      const price = Math.random() * 10;
      const value = convertToUsd(amount, 'XRP', price);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      // Floating point cannot hold every cent exactly, so allow a hair of slack.
      expect(Math.abs(value * 100 - Math.round(value * 100))).toBeLessThan(1e-6);
    }
  });

  it('T90 fuzz: hostile amounts and currencies never produce a bad number', () => {
    const amounts = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      0,
      1e308,
      Number.MIN_VALUE,
    ];
    const currencies = ['XRP', 'USDC', '', ' ', 'xr p', '../../etc', '💸', 'A'.repeat(500)];
    for (const amount of amounts) {
      for (const currency of currencies) {
        const value = convertToUsd(amount, currency, 0.5);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(MAX_ROW_USD);
      }
    }
  });

  it('T91 one implausible payment cannot dominate the public total', () => {
    expect(convertToUsd(1e12, 'USDC', null)).toBe(0);
    expect(convertToUsd(1e12, 'XRP', 5)).toBe(0);
    expect(convertToUsd(MAX_ROW_USD, 'USDC', null)).toBe(MAX_ROW_USD);
  });

  it('T92 the amount scales linearly, so totals can be recomputed', () => {
    const single = convertToUsd(1, 'XRP', 0.4);
    expect(convertToUsd(10, 'XRP', 0.4)).toBe(Math.round(single * 10 * 100) / 100);
  });
});
