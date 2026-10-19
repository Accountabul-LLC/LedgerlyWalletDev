import { AtomicStore, type RawStore } from './atomic-store';

let authQueue: Promise<unknown> = Promise.resolve();
function authOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = authQueue.then(operation, operation);
  authQueue = result.catch(() => {});
  return result;
}

/** Session tokens never use a plaintext fallback. Legacy plaintext is removed on every attempt. */
export function createAuthStorage(
  secure: RawStore,
  legacy: { getItem(key: string): Promise<string | null>; removeItem(key: string): Promise<void> },
) {
  const store = new AtomicStore(secure, 'ledgerly.auth');
  return {
    getItem(key: string): Promise<string | null> {
      return authOperation(async () => {
        try {
          const saved = await store.get<string>(key);
          if (saved !== undefined) {
            if (typeof saved !== 'string') throw new Error('Invalid auth session');
            return saved;
          }
          const old = await legacy.getItem(key);
          if (old !== null) await store.set(key, old);
          return old;
        } finally {
          await legacy.removeItem(key);
        }
      });
    },
    setItem(key: string, value: string): Promise<void> {
      return authOperation(async () => {
        try {
          await store.set(key, value);
        } finally {
          await legacy.removeItem(key);
        }
      });
    },
    removeItem(key: string): Promise<void> {
      return authOperation(async () => {
        try {
          await store.remove(key);
        } finally {
          await legacy.removeItem(key);
        }
      });
    },
  };
}
