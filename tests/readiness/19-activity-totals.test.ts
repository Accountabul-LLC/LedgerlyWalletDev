import { describe, expect, it } from 'vitest';
import { activityNetwork, parsePlatformTotals } from '@/lib/platform-stats';
import { parseValidatedPayment } from '@/lib/ledger-payment';

const hash = 'A'.repeat(64);
const payment = { validated: true, TransactionType: 'Payment', hash, Amount: '1000000000' };

describe('recorded activity totals', () => {
  const totals = {
    wallets_created: '73',
    wallets_activated: '0',
    transactions_signed: '0',
    value_sent_xrp: '0',
  };
  it('retains real zeroes and an explicit network', () => {
    expect(parsePlatformTotals(totals, 'mainnet')).toMatchObject({
      network: 'mainnet',
      walletsCreated: 73,
      walletsActivated: 0,
      transactionsSigned: 0,
      valueSentXrp: 0,
    });
  });
  it('keeps a missing historical XRP amount unavailable', () => {
    expect(
      parsePlatformTotals({ ...totals, value_sent_xrp: null }, 'mainnet').valueSentXrp,
    ).toBeNull();
  });
  it('excludes practice networks from production activity', () => {
    expect(activityNetwork.safeParse('mainnet').success).toBe(true);
    for (const network of ['testnet', 'devnet'])
      expect(activityNetwork.safeParse(network).success).toBe(false);
  });
  it('rejects absent or malformed totals instead of publishing zeroes', () => {
    for (const row of [
      null,
      {},
      { ...totals, wallets_created: null },
      { ...totals, transactions_signed: -1 },
      { ...totals, value_sent_xrp: 'NaN' },
    ]) {
      expect(() => parsePlatformTotals(row, 'mainnet')).toThrow();
    }
  });
  it('ignores failed, unvalidated and unknown partial deliveries', () => {
    for (const meta of [
      undefined,
      { TransactionResult: 'tecPATH_DRY' },
      { TransactionResult: 'tesSUCCESS', delivered_amount: 'unavailable' },
    ]) {
      expect(parseValidatedPayment({ ...payment, meta })).toBeNull();
    }
    expect(
      parseValidatedPayment({
        ...payment,
        Flags: 0x00020000,
        meta: { TransactionResult: 'tesSUCCESS' },
      }),
    ).toBeNull();
    expect(
      parseValidatedPayment({
        ...payment,
        validated: false,
        meta: { TransactionResult: 'tesSUCCESS' },
      }),
    ).toBeNull();
  });
  it('uses delivered XRP instead of the requested partial-payment maximum', () => {
    expect(
      parseValidatedPayment({
        ...payment,
        Flags: 0x00020000,
        meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1250000' },
      }),
    ).toEqual({ hash, amount: 1.25, currency: 'XRP' });
  });
  it('supports nested API v2 transaction fields', () => {
    expect(
      parseValidatedPayment({
        validated: true,
        hash,
        tx_json: { TransactionType: 'Payment', DeliverMax: '2000000' },
        meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '2000000' },
      }),
    ).toEqual({ hash, amount: 2, currency: 'XRP' });
  });
});
