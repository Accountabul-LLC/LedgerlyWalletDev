import {
  MemorySessionStore,
  WalletEngine,
  type Contact,
  type HistoryResult,
  type Portfolio,
  type Preferences,
  type WalletState,
} from '../../../src/ledgerly/core';
import { installLedgerlyCryptoRuntime } from './cryptoRuntime';
import { hostDefaultNetworkId } from './defaultNetwork';
import { NativeKeyValueStore } from './nativeStore';
import { fundAndWait } from './nativeFunding';

export interface NativeWallet {
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  getState(): Promise<WalletState>;
  createWallet(input: { password: string; mnemonic?: string }): Promise<{ mnemonic: string }>;
  confirmBackup(): Promise<void>;
  resumePendingBackup(input: { password: string }): Promise<{ mnemonic: string }>;
  unlock(input: { password: string }): Promise<void>;
  lock(): Promise<void>;
  selectAccount(input: { accountId: string }): Promise<void>;
  generateRecoveryPhrase(): ReturnType<WalletEngine['generateRecoveryPhrase']>;
  previewImport(input: { secret: string }): ReturnType<WalletEngine['previewImport']>;
  addAccountWithOwnPhrase(input: {
    label?: string;
    mnemonic: string;
    expectedAddress?: string;
  }): ReturnType<WalletEngine['addAccountWithOwnPhrase']>;
  importAccount(input: {
    seed: string;
    label?: string;
    expectedAddress?: string;
  }): ReturnType<WalletEngine['importAccount']>;
  renameAccount(input: { accountId: string; label: string }): Promise<void>;
  setNetwork(input: { networkId: string }): Promise<void>;
  setPreferences(
    input: Partial<Omit<Preferences, 'activeAccountId' | 'networkId' | 'backupConfirmed'>>,
  ): Promise<void>;
  getPortfolio(input: { accountId: string; refresh?: boolean }): Promise<Portfolio>;
  getHistory(input: { accountId: string; marker?: unknown }): Promise<HistoryResult>;
  listContacts(): Promise<readonly Contact[]>;
  saveContact(input: {
    id?: string;
    label: string;
    address: string;
    destinationTag?: number;
    note?: string;
  }): Promise<Contact>;
  removeContact(input: { id: string }): Promise<void>;
  fundTestAccount(input: { accountId: string }): Promise<void>;
}

/**
 * The native surface exposes lifecycle operations, read-only ledger queries,
 * and explicit foreground wallet creation/import. Transaction preparation,
 * signing, and general recovery export stay out of the UI until the native isolation
 * boundary and device security review are complete. Password-gated resumption
 * is allowed only for an incomplete initial backup.
 */
export function createNativeWallet(): NativeWallet {
  installLedgerlyCryptoRuntime();
  const listeners = new Set<() => void>();
  const engine = new WalletEngine({
    store: new NativeKeyValueStore(),
    session: new MemorySessionStore(),
    version: '1.0.0-native',
    defaultNetworkId: hostDefaultNetworkId(),
    onStateChanged: () => listeners.forEach((listener) => listener()),
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => engine.start(),
    getState: () => engine.getState(),
    createWallet: (input) => engine.createWallet(input),
    confirmBackup: () => engine.confirmBackup(),
    resumePendingBackup: async (input) => {
      const state = await engine.getState();
      if (state.status !== 'unlocked' || state.preferences.backupConfirmed) {
        throw new Error('Unlock the wallet to finish its pending backup.');
      }
      const result = await engine.exportRecoveryPhrase(input);
      const current = await engine.getState();
      if (current.status !== 'unlocked' || current.preferences.backupConfirmed) {
        throw new Error('The wallet locked. Please unlock and try again.');
      }
      return result;
    },
    unlock: (input) => engine.unlock(input),
    lock: () => engine.lock(),
    selectAccount: (input) => engine.selectAccount(input),
    generateRecoveryPhrase: () => engine.generateRecoveryPhrase(),
    previewImport: (input) => engine.previewImport(input),
    addAccountWithOwnPhrase: (input) => engine.addAccountWithOwnPhrase(input),
    importAccount: (input) => engine.importAccount(input),
    renameAccount: (input) => engine.renameAccount(input),
    setNetwork: (input) => engine.setNetwork(input),
    setPreferences: (input) => engine.setPreferences(input),
    getPortfolio: (input) => engine.getPortfolio(input),
    getHistory: (input) => engine.getHistory(input),
    listContacts: () => engine.listContacts(),
    saveContact: (input) => engine.saveContact(input),
    removeContact: (input) => engine.removeContact(input),
    fundTestAccount: (input) => fundAndWait(engine, input.accountId),
  };
}
