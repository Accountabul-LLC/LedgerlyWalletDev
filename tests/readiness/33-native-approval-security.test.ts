import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletState } from '@/ledgerly/core/shared';

const fixture = vi.hoisted(() => ({
  engine: {} as Record<string, ReturnType<typeof vi.fn>>,
  authListener: null as null | ((event: string) => void),
  unsubscribe: vi.fn(),
}));
vi.mock('@ledgerly/core', () => ({
  MemorySessionStore: class {},
  WalletEngine: class {
    constructor() {
      return fixture.engine;
    }
  },
  isWalletMethod: (method: string) =>
    [
      'getState',
      'lock',
      'preparePayment',
      'prepareTrustSet',
      'confirmPrepared',
      'discardPrepared',
      'setNetwork',
      'setPreferences',
      'selectAccount',
      'createWallet',
      'importFromSeed',
    ].includes(method),
}));
vi.mock('../../mobile/src/storage', () => ({ DeviceStore: class {} }));
vi.mock('../../mobile/src/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (callback: (event: string) => void) => {
        fixture.authListener = callback;
        return { data: { subscription: { unsubscribe: fixture.unsubscribe } } };
      },
    },
  },
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) },
  Linking: { openURL: vi.fn() },
  Text: 'Text',
  View: 'View',
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => [initial, vi.fn()],
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useEffect: (effect: () => unknown) => {
    effect();
  },
}));
import { createMobileRuntime } from '../../mobile/src/runtime';
import { WalletRoot } from '../../mobile/src/wallet';
import { MemoryStore } from '@/ledgerly/core/storage/ports';

function gate<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

beforeEach(() => {
  fixture.authListener = null;
  let next = 0;
  fixture.engine = {
    start: vi.fn(async () => undefined),
    lock: vi.fn(async () => undefined),
    getState: vi.fn(
      async () =>
        ({
          status: 'locked',
          network: { id: 'testnet' },
          connection: { networkId: 'testnet' },
        }) as WalletState,
    ),
    preparePayment: vi.fn(async () => ({ requestId: `payment-${++next}` })),
    prepareTrustSet: vi.fn(async () => ({ requestId: `trust-${++next}` })),
    confirmPrepared: vi.fn(async () => ({ succeeded: true })),
    discardPrepared: vi.fn(async () => undefined),
    setNetwork: vi.fn(async () => undefined),
    setPreferences: vi.fn(async () => undefined),
    selectAccount: vi.fn(async () => undefined),
  };
});

describe('native host approval and auth lifecycle security', () => {
  it('rejects overlapping initial create/import requests and releases the guard after failure', async () => {
    const pending = gate();
    fixture.engine.createWallet = vi.fn(() => pending.promise);
    fixture.engine.importFromSeed = vi.fn(async () => 'synthetic-result');
    const host = createMobileRuntime(new MemoryStore());
    const first = host.request('createWallet', { password: 'synthetic-only' });
    await flush();
    await expect(host.request('createWallet')).rejects.toThrow('already in progress');
    await expect(host.request('importFromSeed')).rejects.toThrow('already in progress');
    expect(fixture.engine.createWallet).toHaveBeenCalledTimes(1);
    expect(fixture.engine.importFromSeed).not.toHaveBeenCalled();
    pending.resolve();
    await first;
    await expect(host.request('importFromSeed')).resolves.toBe('synthetic-result');
    fixture.engine.createWallet.mockRejectedValueOnce(new Error('synthetic-failure'));
    await expect(host.request('createWallet')).rejects.toThrow('synthetic-failure');
    await expect(host.request('importFromSeed')).resolves.toBe('synthetic-result');
  });
  it('never calls signing after changing network or source account', async () => {
    for (const mutation of ['setNetwork', 'selectAccount']) {
      const host = createMobileRuntime(new MemoryStore());
      const prepared = (await host.request('preparePayment')) as { requestId: string };
      await host.request(mutation, { networkId: 'mainnet', accountId: 'other' });
      await expect(host.request('confirmPrepared', prepared)).rejects.toThrow(
        'Review this payment again',
      );
    }
    expect(fixture.engine.confirmPrepared).not.toHaveBeenCalled();
  });

  it('discards an approval that finishes after its network was invalidated', async () => {
    const pending = gate<{ requestId: string }>();
    fixture.engine.preparePayment.mockImplementation(() => pending.promise);
    const host = createMobileRuntime(new MemoryStore());
    const preparation = host.request('preparePayment');
    const rejected = expect(preparation).rejects.toThrow('Review this payment again');
    await flush();
    await host.request('setNetwork', { networkId: 'mainnet' });
    pending.resolve({ requestId: 'late' });
    await rejected;
    expect(fixture.engine.discardPrepared).toHaveBeenCalledWith({ requestId: 'late' });
    expect(fixture.engine.confirmPrepared).not.toHaveBeenCalled();
  });

  it('refuses preparation while a network mutation is unfinished', async () => {
    const pending = gate();
    fixture.engine.setNetwork.mockImplementation(() => pending.promise);
    const host = createMobileRuntime(new MemoryStore());
    const changing = host.request('setNetwork', { networkId: 'mainnet' });
    await expect(host.request('preparePayment')).rejects.toThrow('Review this payment again');
    expect(fixture.engine.preparePayment).not.toHaveBeenCalled();
    pending.resolve();
    await changing;
  });

  it('consumes an approval before simultaneous confirmations can sign twice', async () => {
    const host = createMobileRuntime(new MemoryStore());
    const prepared = (await host.request('prepareTrustSet')) as { requestId: string };
    const results = await Promise.allSettled([
      host.request('confirmPrepared', prepared),
      host.request('confirmPrepared', prepared),
    ]);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(fixture.engine.confirmPrepared).toHaveBeenCalledTimes(1);
  });

  it('backgrounding invalidates an approval even after returning to foreground', async () => {
    const host = createMobileRuntime(new MemoryStore());
    const prepared = (await host.request('preparePayment')) as { requestId: string };
    await host.setActive(false);
    await host.setActive(true);
    await expect(host.request('confirmPrepared', prepared)).rejects.toThrow(
      'Review this payment again',
    );
    expect(fixture.engine.confirmPrepared).not.toHaveBeenCalled();
  });

  it('synchronizes the XRPL connection when hiding the selected test network', async () => {
    let networkId = 'testnet';
    fixture.engine.getState.mockImplementation(async () => ({
      network: { id: networkId },
      connection: { networkId },
    }));
    fixture.engine.setPreferences.mockImplementation(async () => {
      networkId = 'mainnet';
    });
    const host = createMobileRuntime(new MemoryStore());
    const prepared = (await host.request('preparePayment')) as { requestId: string };
    await host.request('setPreferences', { showTestNetworks: false });
    expect(fixture.engine.setNetwork).toHaveBeenCalledExactlyOnceWith({ networkId: 'mainnet' });
    await expect(host.request('confirmPrepared', prepared)).rejects.toThrow(
      'Review this payment again',
    );
    expect(fixture.engine.confirmPrepared).not.toHaveBeenCalled();
  });

  it('serializes overlapping network mutations and refuses preparation until both finish', async () => {
    const first = gate();
    fixture.engine.setNetwork.mockImplementationOnce(() => first.promise);
    const host = createMobileRuntime(new MemoryStore());
    const changing = host.request('setNetwork', { networkId: 'mainnet' });
    const preferences = host.request('setPreferences', { showTestNetworks: false });
    await flush();
    expect(fixture.engine.setPreferences).not.toHaveBeenCalled();
    await expect(host.request('preparePayment')).rejects.toThrow('Review this payment again');
    first.resolve();
    await Promise.all([changing, preferences]);
    expect(fixture.engine.setPreferences).toHaveBeenCalledTimes(1);
    await expect(host.request('preparePayment')).resolves.toHaveProperty('requestId');
  });

  it('refuses preparing and signing when a failed network write leaves display and connection mismatched', async () => {
    const host = createMobileRuntime(new MemoryStore());
    const prepared = (await host.request('preparePayment')) as { requestId: string };
    fixture.engine.getState.mockImplementation(async () => ({
      network: { id: 'testnet' },
      connection: { networkId: 'mainnet' },
    }));
    await expect(host.request('preparePayment')).rejects.toThrow('Review this payment again');
    await expect(host.request('prepareTrustSet')).rejects.toThrow('Review this payment again');
    await expect(host.request('confirmPrepared', prepared)).rejects.toThrow(
      'Review this payment again',
    );
    expect(fixture.engine.preparePayment).toHaveBeenCalledTimes(1);
    expect(fixture.engine.prepareTrustSet).not.toHaveBeenCalled();
    expect(fixture.engine.confirmPrepared).not.toHaveBeenCalled();
  });

  it('locks the actual WalletRoot host when Supabase emits SIGNED_OUT', async () => {
    WalletRoot({ children: null });
    await flush();
    expect(fixture.authListener).not.toBeNull();
    fixture.authListener!('TOKEN_REFRESHED');
    await flush();
    expect(fixture.engine.lock).not.toHaveBeenCalled();
    fixture.authListener!('SIGNED_OUT');
    await flush();
    expect(fixture.engine.lock).toHaveBeenCalledTimes(1);
  });
});
