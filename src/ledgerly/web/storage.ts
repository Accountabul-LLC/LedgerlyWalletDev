import type { KeyValueStore } from '@ledgerly/core';

const DB_NAME = 'ledgerly';
const DB_VERSION = 1;
const STORE_NAME = 'wallet';

/**
 * Durable storage for the web app.
 *
 * IndexedDB rather than localStorage because the engine runs inside a worker,
 * where localStorage does not exist — and that constraint is welcome: it keeps
 * every persisted byte behind the same worker boundary as the keys. Only the
 * encrypted vault and non-secret preferences are written here.
 */
export class IndexedDbStore implements KeyValueStore {
  private database: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
    });
    return this.database;
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error('Storage request failed.'));
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.run<T | undefined>('readonly', (store) => store.get(key));
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.run('readwrite', (store) => store.put(value, key));
  }

  async remove(key: string): Promise<void> {
    await this.run('readwrite', (store) => store.delete(key));
  }

  async clear(): Promise<void> {
    await this.run('readwrite', (store) => store.clear());
  }
}
