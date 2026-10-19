import type { KeyValueStore, SessionSnapshot, SessionStore } from '@ledgerly/core';

/**
 * Durable storage for the extension.
 *
 * `chrome.storage.local` is scoped to this extension: no website and no other
 * extension can read it. Only the encrypted vault and non-secret preferences
 * are written here, exactly as in the web build.
 */
export class ChromeLocalStore implements KeyValueStore {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }

  async clear(): Promise<void> {
    await chrome.storage.local.clear();
  }
}

const SESSION_KEY = 'session';

/**
 * Where the unlocked session lives between service-worker restarts.
 *
 * `chrome.storage.session` is memory-backed and cleared when the browser
 * closes, which is the only place a decrypted vault key may go. Writing it to
 * `chrome.storage.local` would put plaintext keys on disk, so that never
 * happens here.
 */
export class ChromeSessionStore implements SessionStore {
  async read(): Promise<SessionSnapshot | undefined> {
    const result = await chrome.storage.session.get(SESSION_KEY);
    return result[SESSION_KEY] as SessionSnapshot | undefined;
  }

  async write(snapshot: SessionSnapshot): Promise<void> {
    await chrome.storage.session.set({ [SESSION_KEY]: snapshot });
  }

  async clear(): Promise<void> {
    await chrome.storage.session.remove(SESSION_KEY);
  }
}
