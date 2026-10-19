import { afterEach, describe, expect, it, vi } from 'vitest';

const writers = vi.hoisted(() => ({
  recordWalletEvent: vi.fn().mockResolvedValue({ ok: true }),
  recordSignedPaymentValue: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/lib/metrics.functions', () => writers);
import {
  recordPlatformEvent,
  recordSignedPayment,
  recordWalletActivated,
} from '@/ledgerly/ui/metrics';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('production activity reporting', () => {
  it('does not send practice activity or create an analytics identifier for it', async () => {
    const getItem = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { getItem, setItem } });
    for (const network of ['testnet', 'devnet']) {
      recordPlatformEvent('wallet_created', network, 'rPracticeAddress');
      recordWalletActivated(network, ['rPracticeAddress']);
      recordSignedPayment(network, 'A'.repeat(64));
    }
    await Promise.resolve();
    expect(writers.recordWalletEvent).not.toHaveBeenCalled();
    expect(writers.recordSignedPaymentValue).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('continues reporting production payments using public metadata', async () => {
    const signerKey = '00000000-0000-4000-8000-000000000001';
    vi.stubGlobal('window', { localStorage: { getItem: () => signerKey } });
    recordSignedPayment('mainnet', 'A'.repeat(64));
    await Promise.resolve();
    expect(writers.recordSignedPaymentValue).toHaveBeenCalledWith({
      data: { network: 'mainnet', signerKey, txHash: 'A'.repeat(64) },
    });
  });
});
