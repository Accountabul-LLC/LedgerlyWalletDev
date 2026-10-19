import {
  MARKET_OFFLINE_MS,
  MARKET_TTL_MS,
  validateMarketSnapshot,
  type MarketSnapshot,
} from './market-data';

export class MarketRateLimit extends Error {
  constructor(readonly retryMs: number) {
    super('Market data is temporarily unavailable.');
  }
}

export interface MarketViewState {
  snapshot: MarketSnapshot | null;
  loading: boolean;
  saved: boolean;
  error: string | null;
}

interface PublicCache {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}

/** Public quotes only: this service has no wallet, profile or signing dependencies. */
export class MarketClient {
  private state: MarketViewState = { snapshot: null, loading: false, saved: false, error: null };
  private readonly listeners = new Set<() => void>();
  private inFlight: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private hydrated = false;
  private active = true;
  private nextRequestAt = 0;

  constructor(
    private readonly load: (signal: AbortSignal) => Promise<MarketSnapshot>,
    private readonly storage: PublicCache,
    private readonly now: () => number = Date.now,
    private readonly minimumRefreshMs: number = MARKET_TTL_MS,
  ) {}

  getSnapshot = (): MarketViewState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      // Panel replacement unsubscribes and resubscribes in the same turn.
      // Abort only after that turn if nobody took the listener's place.
      if (this.listeners.size === 0) {
        deferMarketTurn(() => {
          if (this.listeners.size === 0) this.controller?.abort();
        });
      }
    };
  };

  private publish(update: Partial<MarketViewState>): void {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.controller?.abort();
  }

  refresh = (): Promise<void> => {
    if (this.inFlight) return this.inFlight;
    if (!this.active) return Promise.resolve();
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  };

  private async run(): Promise<void> {
    if (!this.hydrated) {
      this.hydrated = true;
      try {
        const raw = await this.storage.getItem('ledgerly.market.v1');
        if (raw && raw.length <= 131_072) {
          const snapshot = validateMarketSnapshot(JSON.parse(raw), this.now());
          if (snapshot) this.publish({ snapshot, saved: true });
        }
      } catch {
        /* Public cache failure does not affect the vault or fresh quotes. */
      }
    }
    const cached = this.state.snapshot;
    if (cached && this.now() - cached.fetchedAt < this.minimumRefreshMs && !this.state.error)
      return;
    if (this.now() < this.nextRequestAt || !this.active) return;
    this.controller = new AbortController();
    const controller = this.controller;
    // Also throttle failed requests: repeated taps must not exhaust provider limits.
    this.nextRequestAt = this.now() + this.minimumRefreshMs;
    this.publish({ loading: true, error: null });
    try {
      const snapshot = validateMarketSnapshot(await this.load(controller.signal), this.now());
      if (controller.signal.aborted || !this.active) return;
      if (!snapshot) throw new Error('Invalid market data.');
      this.publish({ snapshot, saved: false });
      await this.storage
        .setItem('ledgerly.market.v1', JSON.stringify(snapshot))
        .catch(() => undefined);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof MarketRateLimit) {
        this.nextRequestAt =
          this.now() + Math.max(this.minimumRefreshMs, Math.min(error.retryMs, MARKET_OFFLINE_MS));
      }
      const snapshot = this.state.snapshot;
      this.publish({
        snapshot:
          snapshot && this.now() - snapshot.fetchedAt <= MARKET_OFFLINE_MS ? snapshot : null,
        saved: Boolean(snapshot),
        error: 'Market data is unavailable. Try again later.',
      });
    } finally {
      if (this.controller === controller) this.controller = null;
      this.publish({ loading: false });
    }
  }
}

/** Runs after the current turn so a replacement view can attach first. */
export function deferMarketTurn(run: () => void): void {
  void Promise.resolve().then(run);
}

export interface MarketActivity {
  setActive(active: boolean): void;
  refresh(): Promise<void> | void;
}

/**
 * Shared quote ownership for the preview and the expanded market panel.
 * Dropping the last view waits one turn before deactivating, so swapping
 * panels does not abort the quote already in flight. Backgrounding still
 * deactivates immediately through `sync`.
 */
export function createMarketViewRegistry(
  client: MarketActivity,
  defer: (run: () => void) => void = deferMarketTurn,
) {
  const views = new Set<symbol>();
  const publish = () => client.setActive(views.size > 0);
  return {
    connect(isForeground: () => boolean) {
      const view = Symbol('market-view');
      const sync = () => {
        if (isForeground()) views.add(view);
        else views.delete(view);
        publish();
        if (isForeground()) void client.refresh();
      };
      sync();
      return {
        sync,
        disconnect() {
          views.delete(view);
          defer(publish);
        },
      };
    },
  };
}

export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return MARKET_TTL_MS;
  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(milliseconds)
    ? Math.max(MARKET_TTL_MS, Math.min(milliseconds, MARKET_OFFLINE_MS))
    : MARKET_TTL_MS;
}
