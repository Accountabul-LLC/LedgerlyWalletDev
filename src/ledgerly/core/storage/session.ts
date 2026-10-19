import type { VaultPayload } from '../vault/schema';

export interface SessionSnapshot {
  readonly payload: VaultPayload;
  /** Which vault this session belongs to; a mismatch means the snapshot is stale. */
  readonly vaultId?: string;
  /** Vault generation the payload was read from. */
  readonly generation?: number;
  /** Base64 vault key. Only ever written to a store that never touches disk. */
  readonly key: string;
  readonly expiresAt: number;
}

/**
 * Where an unlocked session lives between service-worker restarts.
 *
 * An MV3 worker is evicted after about 30 seconds idle. Without somewhere to
 * put the session, the wallet would demand the password every time the popup
 * opened. Implementations must be memory-backed and cleared when the browser
 * closes — `chrome.storage.session` qualifies, `chrome.storage.local` does not,
 * because it writes plaintext keys to disk.
 */
export interface SessionStore {
  read(): Promise<SessionSnapshot | undefined>;
  write(snapshot: SessionSnapshot): Promise<void>;
  clear(): Promise<void>;
}

/** Used by the web app, where the session lives only as long as the worker does. */
export class MemorySessionStore implements SessionStore {
  private snapshot: SessionSnapshot | undefined;

  async read(): Promise<SessionSnapshot | undefined> {
    return this.snapshot;
  }

  async write(snapshot: SessionSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }

  async clear(): Promise<void> {
    this.snapshot = undefined;
  }
}
