import { Client } from 'xrpl';
import { assertSecureEndpoint, type NetworkConfig } from './networks';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  readonly status: ConnectionStatus;
  readonly networkId: string;
  readonly error?: string;
}

const CONNECT_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 20_000;
const IDLE_DISCONNECT_MS = 90_000;

/**
 * Owns the single live connection to a rippled server.
 *
 * An extension service worker is evicted after roughly 30 seconds of
 * inactivity, so a long-lived socket cannot be assumed to survive. The manager
 * therefore connects on demand, keeps the socket only while requests are
 * flowing, and closes it after an idle period instead of running a keepalive
 * ping that would hold the worker awake and drain the user's battery.
 */
export class ConnectionManager {
  private client: Client | null = null;
  private network: NetworkConfig | null = null;
  private connecting: Promise<Client> | null = null;
  private pendingClient: Client | null = null;
  private generation = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = 0;
  private lastError: string | undefined;
  private listeners = new Set<(state: ConnectionState) => void>();

  get state(): ConnectionState {
    const networkId = this.network?.id ?? '';
    if (this.connecting) return { status: 'connecting', networkId };
    if (this.client?.isConnected()) return { status: 'connected', networkId };
    if (this.lastError) return { status: 'error', networkId, error: this.lastError };
    return { status: 'disconnected', networkId };
  }

  subscribe(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const state = this.state;
    for (const listener of this.listeners) listener(state);
  }

  /** Switching networks tears the old socket down first so no request straddles two chains. */
  async useNetwork(network: NetworkConfig): Promise<void> {
    if (this.network?.endpoint === network.endpoint && this.network.networkId === network.networkId) {
      this.network = network;
      return;
    }
    assertSecureEndpoint(network.endpoint);
    this.network = null;
    await this.close();
    this.network = network;
    this.lastError = undefined;
    this.emit();
  }

  /**
   * Runs a request against a connected client, holding the socket open for the
   * duration and restarting the idle countdown afterwards.
   */
  async withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const generation = this.generation;
    const client = await this.connect();
    this.assertCurrent(generation);
    this.inFlight += 1;
    this.cancelIdleTimer();
    try {
      const result = await withTimeout(run(client), REQUEST_TIMEOUT_MS, 'The ledger did not respond in time.');
      this.assertCurrent(generation);
      return result;
    } finally {
      this.inFlight -= 1;
      // The request that drops the count to zero may belong to the previous
      // network. Still arm the idle timer, or the new socket stays open.
      if (this.inFlight === 0) this.scheduleIdleDisconnect();
    }
  }

  private async connect(): Promise<Client> {
    if (!this.network) {
      throw new Error('No network selected.');
    }
    if (this.client?.isConnected()) return this.client;
    if (this.connecting) return this.connecting;

    const network = this.network;
    const generation = this.generation;
    const endpoints = [network.endpoint, ...(network.fallbackEndpoints ?? [])];
    this.connecting = (async () => {
      let lastError: unknown;
      for (const endpoint of endpoints) {
        this.assertCurrent(generation);
        let client: Client | null = null;
        try {
          assertSecureEndpoint(endpoint);
          client = new Client(endpoint, { connectionTimeout: CONNECT_TIMEOUT_MS });
          this.pendingClient = client;
          await withTimeout(
            client.connect(),
            CONNECT_TIMEOUT_MS,
            `Could not reach ${network.label}.`,
          );
          this.assertCurrent(generation);
          assertExpectedNetwork(client, network);
          this.client = client;
          this.lastError = undefined;
          return client;
        } catch (error) {
          if (client) await client.disconnect().catch(() => undefined);
          if (client && this.pendingClient === client) this.pendingClient = null;
          lastError = error;
          if (generation !== this.generation) throw error;
        }
      }
      if (generation === this.generation) {
        this.lastError = lastError instanceof Error ? lastError.message : 'Connection failed.';
      }
      throw lastError instanceof Error ? lastError : new Error('Connection failed.');
    })().finally(() => {
      if (generation === this.generation) {
        this.connecting = null;
        this.pendingClient = null;
        this.emit();
      }
    });

    this.emit();
    return this.connecting;
  }

  private scheduleIdleDisconnect(): void {
    this.cancelIdleTimer();
    if (this.inFlight > 0) return;
    this.idleTimer = setTimeout(() => {
      void this.close();
    }, IDLE_DISCONNECT_MS);
  }

  private cancelIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  async close(): Promise<void> {
    this.generation += 1;
    this.cancelIdleTimer();
    const client = this.client;
    const pending = this.pendingClient;
    this.client = null;
    this.pendingClient = null;
    this.connecting = null;
    if (pending && pending !== client) await pending.disconnect().catch(() => undefined);
    if (client) {
      await client.disconnect().catch(() => undefined);
    }
    this.emit();
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) throw new Error('The network changed. Refresh and try again.');
  }
}

/**
 * The replay guard.
 *
 * A transaction signed for one network can be valid on another whenever the
 * account exists on both, which is a real risk for anyone who funds the same
 * key on Testnet and Mainnet. Refusing to proceed when the server's reported
 * `NetworkID` differs from the selected network means a malicious or misrouted
 * endpoint cannot get a Mainnet-valid signature out of a Testnet session.
 */
function assertExpectedNetwork(client: Client, network: NetworkConfig): void {
  const reported = client.networkID ?? 0;
  if (reported !== network.networkId) {
    throw new Error('The connection does not match the network you picked. Try again.');
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
