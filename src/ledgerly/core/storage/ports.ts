/**
 * The engine never talks to `chrome.storage` or `localStorage` directly. Each
 * host supplies an implementation, which keeps the engine testable and makes
 * the full set of persisted keys visible in one place.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export const STORAGE_KEYS = {
  vault: 'vault',
  preferences: 'preferences',
  permissions: 'permissions',
  unlockGuard: 'unlock-guard',
  networks: 'custom-networks',
} as const;

export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.data.get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}
