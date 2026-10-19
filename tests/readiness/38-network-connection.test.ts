import { afterEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  clients: [] as {
    endpoint: string;
    resolve: () => void;
    reject: (error: Error) => void;
    connected: boolean;
  }[],
}));
vi.mock('xrpl', () => ({
  Client: class {
    connected = false;
    networkID: number;
    resolve!: () => void;
    reject!: (error: Error) => void;
    private gate: Promise<void>;
    constructor(public endpoint: string) {
      this.networkID =
        endpoint.includes('altnet') || endpoint.includes('testnet.xrpl-labs.com')
          ? 1
          : endpoint.includes('devnet')
            ? 2
            : 0;
      this.gate = new Promise((resolve, reject) => {
        this.resolve = () => resolve();
        this.reject = reject;
      });
      fixture.clients.push(this);
    }
    async connect() {
      await this.gate;
      this.connected = true;
    }
    async disconnect() {
      this.connected = false;
    }
    isConnected() {
      return this.connected;
    }
    get url() {
      return this.endpoint;
    }
  },
}));
import { ConnectionManager } from '@/ledgerly/core/xrpl/connection';
import { MAINNET, TESTNET } from '@/ledgerly/core/xrpl/networks';
afterEach(() => {
  fixture.clients.length = 0;
});

describe('network connection generations', () => {
  it('discards a Testnet connection completing after Mainnet was selected', async () => {
    const manager = new ConnectionManager();
    await manager.useNetwork(TESTNET);
    const old = manager.withClient(async () => 'old').catch((error: Error) => error.message);
    const oldClient = fixture.clients[0]!;
    await manager.useNetwork(MAINNET);
    const current = manager.withClient(async (client) => client.url);
    expect(fixture.clients).toHaveLength(2);
    oldClient.resolve();
    expect(await old).toContain('network changed');
    expect(manager.state.status).toBe('connecting');
    fixture.clients[1]!.resolve();
    expect(await current).toBe(MAINNET.endpoint);
    expect(manager.state).toEqual({ status: 'connected', networkId: 'mainnet' });
    expect(oldClient.connected).toBe(false);
    await manager.close();
  });

  it('refuses results from a request already running on the previous network', async () => {
    const manager = new ConnectionManager();
    await manager.useNetwork(TESTNET);
    let finish!: () => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const result = manager
      .withClient(async () => {
        started();
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return 'testnet balance';
      })
      .catch((error: Error) => error.message);
    fixture.clients[0]!.resolve();
    await running;
    await manager.useNetwork(MAINNET);
    finish();
    expect(await result).toContain('network changed');
    await manager.close();
  });

  it('idles the current connection after an older request finishes last', async () => {
    vi.useFakeTimers();
    const manager = new ConnectionManager();
    try {
      await manager.useNetwork(TESTNET);
      let release!: () => void;
      let started!: () => void;
      const running = new Promise<void>((resolve) => {
        started = resolve;
      });
      const stale = manager.withClient(async () => {
        started();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      fixture.clients[0]!.resolve();
      await running;
      await manager.useNetwork(MAINNET);
      const current = manager.withClient(async () => 'ok');
      fixture.clients[1]!.resolve();
      await current;
      expect(manager.state.status).toBe('connected');
      release();
      await stale.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(89_000);
      expect(manager.state.status).toBe('connected');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(manager.state.status).toBe('disconnected');
    } finally {
      await manager.close();
      vi.useRealTimers();
    }
  });

  it('uses the port 443 Testnet server when the primary socket fails', async () => {
    const manager = new ConnectionManager();
    await manager.useNetwork(TESTNET);
    const pending = manager.withClient(async (client) => client.url);
    await vi.waitFor(() => expect(fixture.clients[0]?.endpoint).toBe(TESTNET.endpoint));
    fixture.clients[0]!.reject(new Error('connect ECONNREFUSED 51233'));
    await vi.waitFor(() => expect(fixture.clients).toHaveLength(2));
    expect(fixture.clients[1]!.endpoint).toBe('wss://testnet.xrpl-labs.com');
    fixture.clients[1]!.resolve();
    expect(await pending).toBe('wss://testnet.xrpl-labs.com');
    expect(manager.state).toEqual({ status: 'connected', networkId: 'testnet' });
    await manager.close();
  });
});
