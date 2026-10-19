import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { KeyValueStore } from '@ledgerly/core';
import { AtomicStore } from './atomic-store';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'ledgerly.vault',
};

let secureAvailable: boolean | null = null;

async function canUseSecureStore(): Promise<boolean> {
  if (secureAvailable !== null) return secureAvailable;
  try {
    secureAvailable = await SecureStore.isAvailableAsync();
  } catch {
    secureAvailable = false;
  }
  return secureAvailable;
}

async function readRaw(key: string): Promise<string | null> {
  if (await canUseSecureStore()) {
    return SecureStore.getItemAsync(key, OPTIONS);
  }
  return AsyncStorage.getItem(key);
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(key, value, OPTIONS);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

async function deleteRaw(key: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.deleteItemAsync(key, OPTIONS);
    return;
  }
  await AsyncStorage.removeItem(key);
}

/**
 * Durable store for the encrypted vault and non-secret preferences.
 *
 * Only ciphertext and public metadata are written. The unlocked session key
 * never passes through here — that lives in `MemorySessionStore`.
 */
const atomic = new AtomicStore({ get: readRaw, set: writeRaw, remove: deleteRaw });
export class DeviceStore implements KeyValueStore {
  get<T>(key: string): Promise<T | undefined> {
    return atomic.get<T>(key);
  }
  set<T>(key: string, value: T): Promise<void> {
    return atomic.set(key, value);
  }
  remove(key: string): Promise<void> {
    return atomic.remove(key);
  }
  clear(): Promise<void> {
    return atomic.clear();
  }
}
