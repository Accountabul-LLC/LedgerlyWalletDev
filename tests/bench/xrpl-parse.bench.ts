import { bench, describe } from 'vitest';
import { resolveDestination } from '../../src/ledgerly/core/xrpl/address';
import { dropsToXrp, xrpToDrops } from '../../src/ledgerly/core/xrpl/amount';
import { buildPayment } from '../../src/ledgerly/core/xrpl/transaction';

const FROM = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const DESTINATION = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

describe('xrpl parsing', () => {
  bench('parse an XRP amount into drops', () => {
    xrpToDrops('1234.56789');
  });

  bench('format drops as XRP', () => {
    dropsToXrp('1234567890');
  });

  bench('resolve a classic address', () => {
    resolveDestination(DESTINATION);
  });

  bench('build an XRP payment', () => {
    buildPayment({
      from: FROM,
      destination: DESTINATION,
      amount: { kind: 'xrp', value: '1.5' },
    });
  });
});
