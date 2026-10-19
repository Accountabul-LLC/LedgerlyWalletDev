import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletEngine } from '@/ledgerly/core/engine/engine';
import { MemoryStore } from '@/ledgerly/core/storage/ports';
import { MemorySessionStore } from '@/ledgerly/core/storage/session';
import { fundAndWait } from '@/ledgerly/ui/funding';
import type { WalletApi, WalletState, Portfolio } from '@/ledgerly/core/shared';
import { TESTNET } from '@/ledgerly/core/xrpl/networks';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture() {
  const state = { status: 'unlocked', network: TESTNET } as WalletState;
  const portfolio = (balance: string) =>
    ({ summary: { exists: true, balanceDrops: balance } }) as Portfolio;
  const wallet = {
    getState: vi.fn(async () => state),
    getPortfolio: vi.fn(async () => portfolio('100')),
    fundTestAccount: vi.fn(async () => undefined),
  };
  return {
    wallet,
    state,
    portfolio,
    api: wallet as Pick<WalletApi, 'getState' | 'getPortfolio' | 'fundTestAccount'>,
  };
}

describe('testnet funding', () => {
  it('waits for a validated increase even when the account already exists', async () => {
    const f = fixture();
    f.wallet.getPortfolio
      .mockResolvedValueOnce(f.portfolio('100'))
      .mockResolvedValueOnce(f.portfolio('100'))
      .mockResolvedValueOnce(f.portfolio('200'));
    await fundAndWait(f.api, 'account', async () => {});
    expect(f.wallet.getPortfolio).toHaveBeenCalledTimes(3);
    expect(f.wallet.fundTestAccount).toHaveBeenCalledTimes(1);
  });

  it('reports pending funding rather than success after polling expires', async () => {
    const f = fixture();
    await expect(fundAndWait(f.api, 'account', async () => {})).rejects.toThrow('still pending');
    expect(f.wallet.fundTestAccount).toHaveBeenCalledTimes(1);
  });

  it('retries a failed ledger read without requesting funding twice', async () => {
    const f = fixture();
    f.wallet.getPortfolio
      .mockResolvedValueOnce(f.portfolio('100'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(f.portfolio('200'));
    await fundAndWait(f.api, 'account', async () => {});
    expect(f.wallet.fundTestAccount).toHaveBeenCalledTimes(1);
  });

  it.each(['locked', 'network'] as const)('stops observing after a %s change', async (change) => {
    const f = fixture();
    await expect(
      fundAndWait(f.api, 'account', async () => {
        if (change === 'locked') f.state.status = 'locked';
        else f.state.network = { ...TESTNET, id: 'mainnet' };
      }),
    ).rejects.toThrow('original network');
    expect(f.wallet.getPortfolio).toHaveBeenCalledTimes(1);
  });

  it.each(['locked', 'network'] as const)(
    'does not request funding when %s changes while reading the balance',
    async (change) => {
      const f = fixture();
      f.wallet.getPortfolio.mockImplementation(async () => {
        if (change === 'locked') f.state.status = 'locked';
        else f.state.network = { ...TESTNET, id: 'devnet' };
        return f.portfolio('100');
      });
      await expect(fundAndWait(f.api, 'account', async () => {})).rejects.toThrow(
        'Review it before requesting funding',
      );
      expect(f.wallet.fundTestAccount).not.toHaveBeenCalled();
    },
  );

  it('does not request funding while the wallet is locked', async () => {
    const f = fixture();
    f.state.status = 'locked';
    await expect(fundAndWait(f.api, 'account', async () => {})).rejects.toThrow(
      'Unlock the wallet before requesting funding.',
    );
    expect(f.wallet.fundTestAccount).not.toHaveBeenCalled();
    expect(f.wallet.getPortfolio).not.toHaveBeenCalled();
  });

  it('surfaces faucet errors without polling or resubmitting', async () => {
    const f = fixture();
    f.wallet.fundTestAccount.mockRejectedValueOnce(new Error('rate limited'));
    await expect(fundAndWait(f.api, 'account', async () => {})).rejects.toThrow('rate limited');
    expect(f.wallet.getPortfolio).toHaveBeenCalledTimes(1);
  });

  it('uses a host default only when nothing is saved, and production stays on Mainnet', async () => {
    const fresh = new WalletEngine({
      store: new MemoryStore(),
      session: new MemorySessionStore(),
      version: 'test',
      defaultNetworkId: 'testnet',
    });
    await fresh.start();
    expect((await fresh.getState()).network.id).toBe('testnet');

    const saved = new MemoryStore();
    await saved.set('preferences', { networkId: 'mainnet', autoLockMinutes: 15 });
    const restored = new WalletEngine({
      store: saved,
      session: new MemorySessionStore(),
      version: 'test',
      defaultNetworkId: 'testnet',
    });
    await restored.start();
    expect((await restored.getState()).network.id).toBe('mainnet');
    expect((await restored.getState()).preferences.networkId).toBe('mainnet');

    const production = new WalletEngine({
      store: new MemoryStore(),
      session: new MemorySessionStore(),
      version: 'test',
    });
    await production.start();
    expect((await production.getState()).network.id).toBe('mainnet');
  });

  it('keeps display, persisted preference and connection on Mainnet when hiding Testnet', async () => {
    const engine = new WalletEngine({
      store: new MemoryStore(),
      session: new MemorySessionStore(),
      version: 'test',
    });
    await engine.start();
    await engine.setNetwork({ networkId: 'testnet' });
    await engine.setPreferences({ showTestNetworks: false });
    let state = await engine.getState();
    expect([state.network.id, state.connection.networkId, state.preferences.networkId]).toEqual([
      'mainnet',
      'mainnet',
      'mainnet',
    ]);
    await engine.setPreferences({ showTestNetworks: true });
    state = await engine.getState();
    expect(state.network.id).toBe('mainnet');
    await engine.lock();
  });

  it('serializes simultaneous network and visibility changes', async () => {
    const engine = new WalletEngine({
      store: new MemoryStore(),
      session: new MemorySessionStore(),
      version: 'test',
    });
    await engine.start();
    await Promise.all([
      engine.setNetwork({ networkId: 'testnet' }),
      engine.setPreferences({ showTestNetworks: false }),
    ]);
    const state = await engine.getState();
    expect(state.connection.networkId).toBe(state.network.id);
    expect(state.network.id).toBe('mainnet');
    await expect(engine.setNetwork({ networkId: 'missing' })).rejects.toThrow('Unknown network');
    await engine.setNetwork({ networkId: 'mainnet' });
    await engine.lock();
  });

  it('bounds faucet requests and explains ambiguous timeout delivery', async () => {
    const engine = new WalletEngine({
      store: new MemoryStore(),
      session: new MemorySessionStore(),
      version: 'test',
    });
    await engine.start();
    await engine.setNetwork({ networkId: 'testnet' });
    vi.spyOn(
      engine as unknown as { requireAccount: () => unknown },
      'requireAccount',
    ).mockReturnValue({ address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' });
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('timeout', 'AbortError')),
          );
        }),
    );
    const result = expect(engine.fundTestAccount({ accountId: 'account' })).rejects.toThrow(
      'may still arrive',
    );
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    await engine.lock();
  });

  it('keeps faucet server text off the message shown to the user', async () => {
    const engine = new WalletEngine({
      store: new MemoryStore(),
      session: new MemorySessionStore(),
      version: 'test',
    });
    await engine.start();
    await engine.setNetwork({ networkId: 'testnet' });
    vi.spyOn(
      engine as unknown as { requireAccount: () => unknown },
      'requireAccount',
    ).mockReturnValue({ address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream debug token sk_live_should_not_appear', { status: 503 }),
    );
    await expect(engine.fundTestAccount({ accountId: 'account' })).rejects.toThrow(
      'The faucet could not send test XRP. Wait a moment and try again.',
    );
    await engine.lock();
  });
});
