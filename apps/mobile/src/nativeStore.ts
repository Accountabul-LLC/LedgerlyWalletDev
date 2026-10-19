import Storage from 'expo-sqlite/kv-store';
import type { KeyValueStore } from '../../../src/ledgerly/core';

const PREFIX = 'ledgerly.wallet.';
const LEDGERLY_KEYS = [
  'vault',
  'preferences',
  'permissions',
  'unlock-guard',
  'custom-networks',
] as const;

/** Persistent native storage. Secret material is already AES-GCM encrypted by the Ledgerly vault. */
export class NativeKeyValueStore implements KeyValueStore {
  async get<T>(key: string): Promise<T | undefined> {
    const raw = await Storage.getItem(`${PREFIX}${key}`);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await Storage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await Storage.removeItem(`${PREFIX}${key}`);
  }

  async clear(): Promise<void> {
    await Promise.all(LEDGERLY_KEYS.map((key) => Storage.removeItem(`${PREFIX}${key}`)));
  }
}
