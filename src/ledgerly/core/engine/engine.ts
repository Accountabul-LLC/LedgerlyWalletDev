import type { Transaction } from 'xrpl';
import { base64ToBytes, bytesToBase64, wipe } from '../crypto/bytes';
import { randomBytes } from '../crypto/random';
import { Keyring } from '../keyring/keyring';
import { createMnemonic, isValidMnemonic, normalizeMnemonic } from '../keyring/mnemonic';
import {
  deriveFromMnemonic,
  derivationPath,
  isValidFamilySeed,
  keypairFromFamilySeed,
} from '../keyring/derive';
import { PermissionStore } from '../permissions/store';
import { assessSite } from '../permissions/phishing';
import { parseOrigin } from '../permissions/origin';
import type {
  AccountBackupKind,
  AccountSecretExport,
  AccountView,
  ExternalProviderId,
  ImportPreview,
  ApprovalRequest,
  HistoryResult,
  Portfolio,
  Preferences,
  PreparedTransaction,
  WalletState,
} from '../rpc/protocol';
import { STORAGE_KEYS, type KeyValueStore } from '../storage/ports';
import type { SessionStore } from '../storage/session';
import { assessPassword, MIN_PASSWORD_LENGTH } from '../vault/password';
import { UnlockGuard } from '../vault/guard';
import {
  changeVaultPassword,
  createVault,
  resealVault,
  unlockVault,
} from '../vault/vault';
import {
  emptyPayload,
  isVaultRecord,
  type Contact,
  type StoredAccount,
  type VaultPayload,
  type VaultRecord,
} from '../vault/schema';
import {
  fetchAccountSummary,
  fetchHistoryPage,
  fetchReserveSchedule,
  fetchTokenBalances,
  type ReserveSchedule,
} from '../xrpl/account';
import { assertDestinationTag, isValidAddress, resolveDestination } from '../xrpl/address';
import { ConnectionManager } from '../xrpl/connection';
import { describeTransaction } from '../xrpl/describe';
import { toHistoryEntry } from '../xrpl/history';
import {
  BUILT_IN_NETWORKS,
  DEFAULT_NETWORK_ID,
  findNetwork,
  initialNetworkId,
  validateCustomNetwork,
  type NetworkConfig,
} from '../xrpl/networks';
import { prepareTransaction, submitSigned, type SubmissionResult } from '../xrpl/submit';
import {
  buildPayment,
  buildTrustSet,
  sanitizeDappTransaction,
} from '../xrpl/transaction';
import { ApprovalQueue, ApprovalRejected } from './approvals';

export interface EngineOptions {
  readonly store: KeyValueStore;
  readonly session: SessionStore;
  readonly version: string;
  /**
   * Network used only when the device has no saved network id.
   * Hosts that omit this keep {@link DEFAULT_NETWORK_ID} (Mainnet).
   */
  readonly defaultNetworkId?: string;
  /** Notifies the host that an approval needs a window opened. */
  readonly onApprovalRequested?: () => void;
  readonly onStateChanged?: () => void;
}

const DEFAULT_PREFERENCES: Preferences = {
  autoLockMinutes: 15,
  networkId: DEFAULT_NETWORK_ID,
  hideBalances: false,
  showTestNetworks: true,
  activeAccountId: null,
  backupConfirmed: true,
};

const PORTFOLIO_CACHE_MS = 20_000;
const HISTORY_PAGE_SIZE = 25;
/** Prepared transactions expire so an approved-but-unsent request cannot sit around. */
const PREPARED_TTL_MS = 5 * 60 * 1000;

interface PreparedEntry {
  readonly accountId: string;
  readonly transaction: Transaction;
  readonly createdAt: number;
}

/**
 * The wallet.
 *
 * This object holds every secret the application has, and it is designed to run
 * in a context the page cannot reach — an extension service worker or a
 * dedicated web worker. Callers reach it only through the two RPC surfaces in
 * `rpc/protocol.ts`, so the boundary is a message channel rather than a
 * function call from UI code sharing the same heap.
 */
export class WalletEngine {
  private readonly store: KeyValueStore;
  private readonly session: SessionStore;
  private readonly version: string;
  private readonly guard: UnlockGuard;
  private readonly permissions: PermissionStore;
  private readonly connection = new ConnectionManager();
  private readonly keyring = new Keyring();
  private readonly approvals = new ApprovalQueue();

  private vaultRecord: VaultRecord | null = null;
  private payload: VaultPayload | null = null;
  private sessionKey: Uint8Array | null = null;
  private preferences: Preferences = DEFAULT_PREFERENCES;
  private customNetworks: NetworkConfig[] = [];
  private reserve: ReserveSchedule | null = null;
  private portfolioCache = new Map<string, Portfolio>();
  private prepared = new Map<string, PreparedEntry>();
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionExpiresAt: number | null = null;
  private startup: Promise<void> | null = null;
  private networkMutation: Promise<void> = Promise.resolve();

  constructor(private readonly options: EngineOptions) {
    this.store = options.store;
    this.session = options.session;
    this.version = options.version;
    this.guard = new UnlockGuard(options.store);
    this.permissions = new PermissionStore(options.store);
    this.approvals.subscribe(() => this.options.onStateChanged?.());
    this.connection.subscribe(() => this.options.onStateChanged?.());
  }

  /**
   * Loads persisted state and restores an unexpired session, if one survives.
   *
   * The promise is cached rather than guarded by a boolean: a second caller
   * that arrives mid-load must wait for the same work to finish, not return
   * immediately and read a half-initialised engine that reports an existing
   * wallet as uninitialised.
   */
  async start(): Promise<void> {
    this.startup ??= this.load();
    return this.startup;
  }

  private async load(): Promise<void> {
    const [storedVault, storedPreferences, storedNetworks] = await Promise.all([
      this.store.get<unknown>(STORAGE_KEYS.vault),
      this.store.get<Partial<Preferences>>(STORAGE_KEYS.preferences),
      this.store.get<NetworkConfig[]>(STORAGE_KEYS.networks),
    ]);

    this.vaultRecord = isVaultRecord(storedVault) ? storedVault : null;
    const stored = storedPreferences ?? {};
    // A saved networkId is left untouched. defaultNetworkId applies only when it is absent.
    this.preferences = {
      ...DEFAULT_PREFERENCES,
      ...stored,
      networkId: initialNetworkId(stored.networkId, this.options.defaultNetworkId),
    };
    this.customNetworks = Array.isArray(storedNetworks) ? storedNetworks : [];

    await this.connection.useNetwork(this.activeNetwork());
    await this.restoreSession();
  }

  private async restoreSession(): Promise<void> {
    const snapshot = await this.session.read();
    if (!snapshot) return;
    if (snapshot.expiresAt <= Date.now()) {
      await this.session.clear();
      return;
    }
    // A snapshot taken from a different vault, or from an earlier generation of
    // this one, describes a wallet that no longer exists on this device. Using
    // it is what makes an older set of accounts reappear, so it is discarded.
    const current = this.vaultRecord;
    const staleVault =
      !current ||
      (snapshot.vaultId !== undefined &&
        current.id !== undefined &&
        snapshot.vaultId !== current.id) ||
      (snapshot.generation !== undefined &&
        current.generation !== undefined &&
        snapshot.generation !== current.generation);
    if (staleVault) {
      await this.session.clear();
      return;
    }
    try {
      this.payload = snapshot.payload;
      this.sessionKey = base64ToBytes(snapshot.key);
      await this.keyring.load(snapshot.payload);
      // Resume the deadline the session was written with. Restarting the clock
      // here would let a wallet stay unlocked indefinitely across the service
      // worker's eviction cycle.
      this.sessionExpiresAt = snapshot.expiresAt;
      this.clearAutoLock();
      this.lockTimer = setTimeout(() => void this.lock(), snapshot.expiresAt - Date.now());
    } catch {
      await this.lock();
    }
  }

  // ---------------------------------------------------------------- lifecycle

  get isUnlocked(): boolean {
    return this.payload !== null && this.sessionKey !== null;
  }

  async getState(): Promise<WalletState> {
    const status = this.vaultRecord === null ? 'uninitialized' : this.isUnlocked ? 'unlocked' : 'locked';
    const lockout = await this.guard.remainingLockout();
    return {
      status,
      accounts: this.isUnlocked ? this.accountViews() : [],
      activeAccountId: this.isUnlocked ? this.resolveActiveAccountId() : null,
      network: this.activeNetwork(),
      networks: this.availableNetworks(),
      connection: this.connection.state,
      preferences: this.preferences,
      lockoutUntil: lockout > 0 ? Date.now() + lockout : null,
      sessionExpiresAt: this.isUnlocked ? this.sessionExpiresAt : null,
      pendingApprovals: this.approvals.size,
    };
  }

  async createWallet(input: { password: string; mnemonic?: string }): Promise<{ mnemonic: string }> {
    if (this.vaultRecord) {
      throw new Error('A wallet already exists. Reset it first if you want to start over.');
    }
    this.assertPasswordAcceptable(input.password);

    const restoring = input.mnemonic !== undefined;
    const mnemonic = input.mnemonic ? normalizeMnemonic(input.mnemonic) : createMnemonic();
    if (!isValidMnemonic(mnemonic)) {
      throw new Error('That recovery phrase is not valid.');
    }

    const first = await this.buildDerivedAccount(mnemonic, 0, 'Account 1');
    const payload: VaultPayload = { ...emptyPayload(mnemonic), accounts: [first] };

    const { record, key } = await createVault(input.password, payload);
    await this.writeVault(record);

    await this.openSession(payload, key);
    // A phrase the wallet just generated has not been written down yet. One the
    // user supplied is already in their hands, so it needs no backup step.
    await this.updatePreferences({ activeAccountId: first.id, backupConfirmed: restoring });
    return { mnemonic };
  }

  async confirmBackup(): Promise<void> {
    this.requirePayload();
    await this.updatePreferences({ backupConfirmed: true });
  }

  async importFromSeed(input: { password: string; seed: string; label?: string }): Promise<void> {
    if (this.vaultRecord) {
      throw new Error('A wallet already exists. Reset it first if you want to start over.');
    }
    this.assertPasswordAcceptable(input.password);

    const seed = input.seed.trim();
    if (!isValidFamilySeed(seed)) {
      throw new Error('That is not a valid XRPL secret.');
    }
    const keypair = keypairFromFamilySeed(seed);
    const account: StoredAccount = {
      id: newId(),
      label: input.label?.trim() || 'Imported account',
      address: keypair.address,
      source: { kind: 'imported', seed, algorithm: keypair.algorithm },
      createdAt: Date.now(),
    };

    const payload: VaultPayload = { ...emptyPayload(null), accounts: [account] };
    const { record, key } = await createVault(input.password, payload);
    await this.writeVault(record);

    await this.openSession(payload, key);
    // The user supplied this secret, so there is nothing new to back up.
    await this.updatePreferences({ activeAccountId: account.id, backupConfirmed: true });
  }

  async unlock(input: { password: string }): Promise<void> {
    // Always unlock the vault that is on disk right now. Another tab may have
    // rewritten it since this one started, and unlocking a copy held in memory
    // is exactly how an older wallet reappears after a sign out and back in.
    const stored = await this.readStoredVault();
    if (stored) this.vaultRecord = stored;
    const record = this.vaultRecord;
    if (!record) throw new Error('There is no wallet to unlock.');

    await this.guard.assertAttemptAllowed();
    const result = await unlockVault(record, input.password);
    if (!result) {
      await this.guard.recordFailure();
      throw new Error('Incorrect password.');
    }
    await this.guard.recordSuccess();

    this.payload = result.payload;
    this.sessionKey = result.key;
    await this.keyring.load(result.payload);
    await this.persistSession();
    this.scheduleAutoLock();
    this.options.onStateChanged?.();
  }

  /** Drops every secret held in memory and declines anything waiting on the user. */
  async lock(): Promise<void> {
    this.clearAutoLock();
    this.keyring.wipe();
    if (this.sessionKey) wipe(this.sessionKey);
    this.sessionKey = null;
    this.payload = null;
    this.sessionExpiresAt = null;
    this.portfolioCache.clear();
    this.prepared.clear();
    this.approvals.rejectAll('The wallet was locked.');
    await this.session.clear();
    await this.connection.close();
    this.options.onStateChanged?.();
  }

  async resetWallet(input: { confirmation: string }): Promise<void> {
    if (input.confirmation !== 'ERASE') {
      throw new Error('Type ERASE to confirm.');
    }
    await this.lock();
    await this.store.clear();
    this.vaultRecord = null;
    this.preferences = DEFAULT_PREFERENCES;
    this.customNetworks = [];
    this.options.onStateChanged?.();
  }

  async assessPassword(input: { password: string }) {
    return assessPassword(input.password);
  }

  async changePassword(input: { current: string; next: string }): Promise<void> {
    const record = this.requireVault();
    this.assertPasswordAcceptable(input.next);
    await this.guard.assertAttemptAllowed();

    const next = await changeVaultPassword(record, input.current, input.next);
    if (!next) {
      await this.guard.recordFailure();
      throw new Error('Current password is incorrect.');
    }
    await this.guard.recordSuccess();
    await this.writeVault(next.record);

    // The old session key no longer decrypts the vault, so adopt the new one.
    if (this.payload) {
      await this.openSession(this.payload, next.key);
    } else {
      wipe(next.key);
    }
  }

  /**
   * Secret export re-verifies the password against the vault rather than
   * trusting that the session is unlocked. An unlocked wallet on an unattended
   * screen should not hand over the recovery phrase for a single click.
   */
  async exportRecoveryPhrase(input: { password: string }): Promise<{ mnemonic: string }> {
    const payload = await this.reauthenticate(input.password);
    if (!payload.mnemonic) {
      throw new Error('This wallet was imported from a secret and has no recovery phrase.');
    }
    return { mnemonic: payload.mnemonic };
  }

  /**
   * Export symmetry: every wallet can hand back the material that actually
   * recreates it, together with the derivation inputs needed to reproduce the
   * same classic address in any other tool. Nothing here is inferred from an
   * SDK default; the algorithm and path are the ones this wallet signs with.
   */
  async exportAccountSecret(input: {
    password: string;
    accountId: string;
  }): Promise<AccountSecretExport> {
    const payload = await this.reauthenticate(input.password);
    const account = payload.accounts.find((candidate) => candidate.id === input.accountId);
    if (!account) throw new Error('No such account.');

    if (account.source.kind === 'imported') {
      return {
        kind: 'familySeed',
        secret: account.source.seed,
        algorithm: account.source.algorithm,
        path: null,
        index: null,
        address: account.address,
      };
    }
    if (account.source.kind === 'ownPhrase') {
      return {
        kind: 'mnemonic',
        secret: account.source.mnemonic,
        algorithm: 'secp256k1',
        path: derivationPath(0),
        index: 0,
        address: account.address,
      };
    }
    if (account.source.kind === 'external') {
      throw new Error('This wallet is held in another app, so there is no secret to export here.');
    }
    if (!payload.mnemonic) {
      throw new Error('This wallet has no recovery phrase on this device.');
    }
    return {
      kind: 'mnemonic',
      secret: payload.mnemonic,
      algorithm: 'secp256k1',
      path: derivationPath(account.source.index),
      index: account.source.index,
      address: account.address,
    };
  }

  /**
   * Derives an address from pasted recovery material without storing anything,
   * so the import screen can show the exact account before it is added and the
   * user can reject a mismatch instead of discovering it later.
   */
  async previewImport(input: { secret: string }): Promise<ImportPreview> {
    const payload = this.requirePayload();
    const raw = input.secret.trim().replace(/\s+/g, ' ');
    if (raw === '') throw new Error('Paste a recovery phrase or family seed first.');

    if (raw.includes(' ')) {
      const mnemonic = normalizeMnemonic(raw);
      const words = mnemonic.split(' ').length;
      if (words !== 12 && words !== 24) {
        throw new Error('A recovery phrase is 12 or 24 words. Check for missing or extra words.');
      }
      if (!isValidMnemonic(mnemonic)) {
        throw new Error('That recovery phrase is not valid. Check the words and their order.');
      }
      const keypair = await deriveFromMnemonic(mnemonic, 0);
      return {
        kind: 'mnemonic',
        address: keypair.address,
        algorithm: keypair.algorithm,
        path: derivationPath(0),
        index: 0,
        alreadyPresent: payload.accounts.some((account) => account.address === keypair.address),
      };
    }

    if (!isValidFamilySeed(raw)) {
      throw new Error('That is not a valid XRPL family seed.');
    }
    const keypair = keypairFromFamilySeed(raw);
    return {
      kind: 'familySeed',
      address: keypair.address,
      algorithm: keypair.algorithm,
      path: null,
      index: null,
      alreadyPresent: payload.accounts.some((account) => account.address === keypair.address),
    };
  }

  async exportAccountSeed(input: { password: string; accountId: string }): Promise<{ seed: string }> {
    const payload = await this.reauthenticate(input.password);
    const account = payload.accounts.find((candidate) => candidate.id === input.accountId);
    if (!account) throw new Error('No such account.');
    if (account.source.kind !== 'imported') {
      throw new Error('This account comes from the recovery phrase. Export the phrase instead.');
    }
    return { seed: account.source.seed };
  }

  private async reauthenticate(password: string): Promise<VaultPayload> {
    const record = this.requireVault();
    await this.guard.assertAttemptAllowed();
    const result = await unlockVault(record, password);
    if (!result) {
      await this.guard.recordFailure();
      throw new Error('Incorrect password.');
    }
    await this.guard.recordSuccess();
    wipe(result.key);
    return result.payload;
  }

  // ----------------------------------------------------------------- accounts

  private accountViews(): AccountView[] {
    return this.requirePayload().accounts.map((account) => ({
      id: account.id,
      label: account.label,
      address: account.address,
      isImported: account.source.kind === 'imported',
      derivationIndex: account.source.kind === 'derived' ? account.source.index : null,
      backup: backupKindOf(account),
      external: externalOf(account),
    }));
  }

  /**
   * Derives the address the next wallet would get without writing it to the
   * vault, so the confirm step can show the user exactly what they are about
   * to add.
   */
  async previewNextAccount(): Promise<{ address: string; index: number }> {
    const payload = this.requirePayload();
    if (!payload.mnemonic) {
      throw new Error('This wallet has no recovery phrase, so it cannot derive new accounts.');
    }
    const index = this.nextDerivationIndex(payload);
    const keypair = await deriveFromMnemonic(payload.mnemonic, index);
    return { address: keypair.address, index };
  }

  private nextDerivationIndex(payload: VaultPayload): number {
    return payload.accounts.reduce(
      (max, account) => (account.source.kind === 'derived' ? Math.max(max, account.source.index + 1) : max),
      0,
    );
  }

  async generateRecoveryPhrase(): Promise<{ mnemonic: string }> {
    this.requirePayload();
    return { mnemonic: createMnemonic() };
  }

  /** Creates a wallet backed by its own phrase, unlinked from the vault phrase. */
  async addAccountWithOwnPhrase(input: {
    label?: string;
    mnemonic: string;
    expectedAddress?: string;
  }): Promise<AccountView> {
    const payload = this.requirePayload();
    const mnemonic = normalizeMnemonic(input.mnemonic);
    if (!isValidMnemonic(mnemonic)) {
      throw new Error('That recovery phrase is not valid.');
    }
    const keypair = await deriveFromMnemonic(mnemonic, 0);
    // The address the user confirmed on the preview must be the one added.
    if (input.expectedAddress && input.expectedAddress !== keypair.address) {
      throw new Error('That preview no longer matches this phrase. Start the import again.');
    }
    if (payload.accounts.some((account) => account.address === keypair.address)) {
      throw new Error('That wallet is already in this app.');
    }
    const account: StoredAccount = {
      id: newId(),
      label: input.label?.trim() || `Wallet ${payload.accounts.length + 1}`,
      address: keypair.address,
      source: { kind: 'ownPhrase', mnemonic },
      createdAt: Date.now(),
    };
    await this.mutatePayload((current) => ({ ...current, accounts: [...current.accounts, account] }));
    await this.keyring.add(account, payload.mnemonic);
    return this.viewOf(account);
  }

  async addAccount(input: { label?: string; expectedAddress?: string }): Promise<AccountView> {
    const payload = this.requirePayload();
    if (!payload.mnemonic) {
      throw new Error('This wallet has no recovery phrase, so it cannot derive new accounts.');
    }
    const nextIndex = this.nextDerivationIndex(payload);
    const label = input.label?.trim() || `Account ${payload.accounts.length + 1}`;
    const account = await this.buildDerivedAccount(payload.mnemonic, nextIndex, label);
    // The preview the user confirmed must be the wallet they get.
    if (input.expectedAddress && input.expectedAddress !== account.address) {
      throw new Error('That preview is out of date. Start again to see the current address.');
    }

    await this.mutatePayload((current) => ({ ...current, accounts: [...current.accounts, account] }));
    await this.keyring.add(account, payload.mnemonic);
    return this.viewOf(account);
  }

  async importAccount(input: {
    seed: string;
    label?: string;
    expectedAddress?: string;
  }): Promise<AccountView> {
    const payload = this.requirePayload();
    const seed = input.seed.trim();
    if (!isValidFamilySeed(seed)) {
      throw new Error('That is not a valid XRPL secret.');
    }
    const keypair = keypairFromFamilySeed(seed);
    if (input.expectedAddress && input.expectedAddress !== keypair.address) {
      throw new Error('That preview no longer matches this seed. Start the import again.');
    }
    if (payload.accounts.some((account) => account.address === keypair.address)) {
      throw new Error('That account is already in this wallet.');
    }

    const account: StoredAccount = {
      id: newId(),
      label: input.label?.trim() || `Imported ${keypair.address.slice(0, 6)}`,
      address: keypair.address,
      source: { kind: 'imported', seed, algorithm: keypair.algorithm },
      createdAt: Date.now(),
    };
    await this.mutatePayload((current) => ({ ...current, accounts: [...current.accounts, account] }));
    await this.keyring.add(account, payload.mnemonic);
    return this.viewOf(account);
  }

  /**
   * Connects a wallet the user already has in another app. Only its public
   * address crosses over; there is no secret to take, so nothing about this
   * account can ever be exported or signed here.
   */
  async connectExternalAccount(input: {
    provider: ExternalProviderId;
    address: string;
    label?: string;
  }): Promise<AccountView> {
    const payload = this.requirePayload();
    const address = input.address.trim();
    if (!isValidAddress(address)) {
      throw new Error('That is not a valid XRP Ledger address.');
    }
    if (input.provider !== 'joey') {
      throw new Error('That wallet is not supported yet.');
    }
    if (payload.accounts.some((account) => account.address === address)) {
      throw new Error('That wallet is already in this app.');
    }
    const account: StoredAccount = {
      id: newId(),
      label: input.label?.trim().slice(0, 40) || `Joey ${address.slice(0, 6)}`,
      address,
      source: { kind: 'external', provider: input.provider, address },
      createdAt: Date.now(),
    };
    await this.mutatePayload((current) => ({ ...current, accounts: [...current.accounts, account] }));
    await this.keyring.add(account, payload.mnemonic);
    return this.viewOf(account);
  }

  async renameAccount(input: { accountId: string; label: string }): Promise<void> {
    const label = input.label.trim();
    if (label.length === 0 || label.length > 40) {
      throw new Error('Account names must be between 1 and 40 characters.');
    }
    await this.mutatePayload((current) => ({
      ...current,
      accounts: current.accounts.map((account) =>
        account.id === input.accountId ? { ...account, label } : account,
      ),
    }));
  }

  /**
   * Removes one wallet from this device without touching the others.
   *
   * A wallet holding its own secret (an imported family seed, or a wallet
   * created with its own phrase) takes that secret with it, so those removals
   * require an explicit acknowledgement from the caller after the export step.
   * A derived wallet is always recoverable from the vault phrase, so it does
   * not.
   */
  async removeAccount(input: { accountId: string; acknowledged?: boolean }): Promise<void> {
    const payload = this.requirePayload();
    if (payload.accounts.length <= 1) {
      throw new Error('A wallet must keep at least one account.');
    }
    const account = payload.accounts.find((candidate) => candidate.id === input.accountId);
    if (!account) throw new Error('No such account.');
    // A connected outside wallet keeps its key in the other app, so removing it
    // here loses nothing and needs no acknowledgement.
    const holdsOwnSecret = account.source.kind === 'imported' || account.source.kind === 'ownPhrase';
    if (holdsOwnSecret && input.acknowledged !== true) {
      throw new Error(
        'This wallet holds its own secret. Export it first, then confirm that you have it saved.',
      );
    }


    await this.mutatePayload((current) => ({
      ...current,
      accounts: current.accounts.filter((candidate) => candidate.id !== input.accountId),
    }));
    this.keyring.remove(input.accountId);
    await this.permissions.pruneAccount(input.accountId);
    this.forgetPortfolio(input.accountId);

    if (this.preferences.activeAccountId === input.accountId) {
      await this.updatePreferences({ activeAccountId: this.requirePayload().accounts[0]?.id ?? null });
    }
  }

  async selectAccount(input: { accountId: string }): Promise<void> {
    this.requireAccount(input.accountId);
    this.touchActivity();
    await this.updatePreferences({ activeAccountId: input.accountId });
  }

  private async buildDerivedAccount(
    mnemonic: string,
    index: number,
    label: string,
  ): Promise<StoredAccount> {
    const keypair = await deriveFromMnemonic(mnemonic, index);
    return {
      id: newId(),
      label,
      address: keypair.address,
      source: { kind: 'derived', index },
      createdAt: Date.now(),
    };
  }

  private viewOf(account: StoredAccount): AccountView {
    return {
      id: account.id,
      label: account.label,
      address: account.address,
      isImported: account.source.kind === 'imported',
      derivationIndex: account.source.kind === 'derived' ? account.source.index : null,
      backup: backupKindOf(account),
      external: externalOf(account),
    };
  }

  // ----------------------------------------------------------------- networks

  private availableNetworks(): NetworkConfig[] {
    const builtIn = this.preferences.showTestNetworks
      ? BUILT_IN_NETWORKS
      : BUILT_IN_NETWORKS.filter((network) => !network.isTest);
    return [...builtIn, ...this.customNetworks];
  }

  private activeNetwork(): NetworkConfig {
    return (
      findNetwork(this.availableNetworks(), this.preferences.networkId) ??
      findNetwork(BUILT_IN_NETWORKS, DEFAULT_NETWORK_ID) ??
      BUILT_IN_NETWORKS[0]!
    );
  }

  async setNetwork(input: { networkId: string }): Promise<void> {
    return this.mutateNetwork(() => this.changeNetwork(input.networkId));
  }

  private mutateNetwork(action: () => Promise<void>): Promise<void> {
    const next = this.networkMutation.then(action);
    this.networkMutation = next.catch(() => undefined);
    return next;
  }

  private async changeNetwork(networkId: string): Promise<void> {
    const network = findNetwork(this.availableNetworks(), networkId);
    if (!network) throw new Error('Unknown network.');
    this.touchActivity();
    this.portfolioCache.clear();
    this.reserve = null;
    this.prepared.clear();
    await this.connection.useNetwork(network);
    await this.updatePreferences({ networkId: network.id });
  }

  async addCustomNetwork(input: {
    label: string;
    endpoint: string;
    networkId: number;
  }): Promise<NetworkConfig> {
    const network = validateCustomNetwork(input);
    if (this.availableNetworks().some((candidate) => candidate.id === network.id)) {
      throw new Error('That endpoint is already configured.');
    }
    this.customNetworks = [...this.customNetworks, network];
    await this.store.set(STORAGE_KEYS.networks, this.customNetworks);
    this.options.onStateChanged?.();
    return network;
  }

  async removeCustomNetwork(input: { networkId: string }): Promise<void> {
    this.customNetworks = this.customNetworks.filter((network) => network.id !== input.networkId);
    await this.store.set(STORAGE_KEYS.networks, this.customNetworks);
    if (this.preferences.networkId === input.networkId) {
      await this.setNetwork({ networkId: DEFAULT_NETWORK_ID });
    }
    this.options.onStateChanged?.();
  }

  /**
   * Only the three display preferences can be set here.
   *
   * The parameter type excludes the rest, but types are erased at the message
   * boundary — the caller sends JSON. So the allowed fields are picked
   * explicitly rather than spreading the input: otherwise a request carrying
   * `backupConfirmed` would skip the recovery-phrase step, and one carrying
   * `activeAccountId` would select an account without the existence check that
   * `selectAccount` performs.
   */
  async setPreferences(
    input: Partial<Omit<Preferences, 'activeAccountId' | 'networkId' | 'backupConfirmed'>>,
  ): Promise<void> {
    const update: { -readonly [K in keyof Preferences]?: Preferences[K] } = {};

    if (input.autoLockMinutes !== undefined) {
      const minutes = input.autoLockMinutes;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
        throw new Error('Auto-lock must be between 1 and 480 minutes.');
      }
      update.autoLockMinutes = minutes;
    }
    if (typeof input.hideBalances === 'boolean') {
      update.hideBalances = input.hideBalances;
    }
    if (typeof input.showTestNetworks === 'boolean') {
      update.showTestNetworks = input.showTestNetworks;
    }

    await this.mutateNetwork(async () => {
      if (update.showTestNetworks === false && this.activeNetwork().isTest &&
          BUILT_IN_NETWORKS.some((network) => network.id === this.preferences.networkId)) {
        await this.changeNetwork(DEFAULT_NETWORK_ID);
      }
      await this.updatePreferences(update);
      this.scheduleAutoLock();
    });
  }

  // ---------------------------------------------------------------- portfolio

  /** Drops the cached balances an account has on every network. */
  private forgetPortfolio(accountId: string): void {
    for (const key of [...this.portfolioCache.keys()]) {
      if (key.endsWith(`:${accountId}`)) this.portfolioCache.delete(key);
    }
  }

  async getPortfolio(input: { accountId: string; refresh?: boolean }): Promise<Portfolio> {
    const account = this.requireAccount(input.accountId);
    // Balances belong to one network. Keying the cache by network as well as
    // account keeps a testnet result from ever being handed back on Mainnet.
    const networkId = this.activeNetwork().id;
    const cacheKey = `${networkId}:${input.accountId}`;
    const cached = this.portfolioCache.get(cacheKey);
    if (!input.refresh && cached && Date.now() - cached.fetchedAt < PORTFOLIO_CACHE_MS) {
      return cached;
    }

    const portfolio = await this.connection.withClient(async (client) => {
      const reserve = this.reserve ?? (await fetchReserveSchedule(client));
      this.reserve = reserve;
      const [summary, tokens] = await Promise.all([
        fetchAccountSummary(client, account.address, reserve),
        fetchTokenBalances(client, account.address),
      ]);
      return { summary, reserve, tokens, fetchedAt: Date.now() } satisfies Portfolio;
    });

    // The user can switch networks while this request is in flight. Refetch
    // rather than return figures that belong to the network they just left.
    if (this.activeNetwork().id !== networkId) {
      return this.getPortfolio({ ...input, refresh: true });
    }

    this.portfolioCache.set(cacheKey, portfolio);
    // Reading balances is not activity. The rule is uniform: only operations
    // that change something push the auto-lock deadline out, so no amount of
    // background refreshing can keep an unattended wallet unlocked.
    return portfolio;
  }

  async getHistory(input: { accountId: string; marker?: unknown }): Promise<HistoryResult> {
    const account = this.requireAccount(input.accountId);
    return this.connection.withClient(async (client) => {
      const page = await fetchHistoryPage(client, account.address, HISTORY_PAGE_SIZE, input.marker);
      const entries = page.entries
        .map((entry) => toHistoryEntry(entry, account.address))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      return { entries, marker: page.marker };
    });
  }

  // ------------------------------------------------------------- transactions

  async preparePayment(input: {
    accountId: string;
    destination: string;
    destinationTag?: number;
    amount:
      | { kind: 'xrp'; value: string }
      | { kind: 'token'; value: string; currency: string; issuer: string };
    memo?: string;
  }): Promise<PreparedTransaction> {
    const account = this.requireAccount(input.accountId);
    const draft = buildPayment({
      from: account.address,
      destination: input.destination,
      ...(input.destinationTag === undefined ? {} : { destinationTag: input.destinationTag }),
      amount: input.amount,
      ...(input.memo === undefined ? {} : { memo: input.memo }),
      expectTestNetwork: this.activeNetwork().isTest,
    });
    this.touchActivity();
    return this.stage(input.accountId, draft, account.address);
  }

  async prepareTrustSet(input: {
    accountId: string;
    currency: string;
    issuer: string;
    limit: string;
  }): Promise<PreparedTransaction> {
    const account = this.requireAccount(input.accountId);
    const draft = buildTrustSet({
      from: account.address,
      currency: input.currency,
      issuer: input.issuer,
      limit: input.limit,
    });
    this.touchActivity();
    return this.stage(input.accountId, draft, account.address);
  }

  /**
   * Autofills, describes, and keeps the transaction here.
   *
   * The UI receives a description and an id, never a transaction it could edit
   * and hand back. Signing reads the object out of this map, so what the user
   * approved and what gets signed are guaranteed to be the same bytes.
   */
  private async stage(
    accountId: string,
    draft: Transaction,
    address: string,
  ): Promise<PreparedTransaction> {
    const { transaction, description } = await this.connection.withClient(async (client) => {
      const prepared = await prepareTransaction(client, draft);
      const reserve = this.reserve ?? (await fetchReserveSchedule(client));
      this.reserve = reserve;

      const source = await fetchAccountSummary(client, address, reserve);
      const destinationAddress =
        'Destination' in prepared && typeof prepared.Destination === 'string'
          ? prepared.Destination
          : null;
      const destination = destinationAddress
        ? await fetchAccountSummary(client, destinationAddress, reserve)
        : undefined;
      const currentLedger = await client.getLedgerIndex().catch(() => undefined);

      return {
        transaction: prepared,
        description: describeTransaction(prepared, {
          source,
          ...(destination ? { destination } : {}),
          ...(currentLedger === undefined ? {} : { currentLedger }),
        }),
      };
    });

    this.pruneStale();
    const requestId = newId();
    this.prepared.set(requestId, { accountId, transaction, createdAt: Date.now() });
    return { requestId, transaction, description };
  }

  async confirmPrepared(input: { requestId: string }): Promise<SubmissionResult> {
    const entry = this.prepared.get(input.requestId);
    if (!entry || Date.now() - entry.createdAt > PREPARED_TTL_MS) {
      this.prepared.delete(input.requestId);
      throw new Error('That transaction expired. Build it again to pick up a current fee.');
    }
    this.prepared.delete(input.requestId);
    if (this.keyring.isExternal(entry.accountId)) {
      throw new Error('That wallet is held in another app. Approve the transaction there instead.');
    }

    const signed = this.keyring.sign(entry.accountId, entry.transaction);
    const result = await this.connection.withClient((client) => submitSigned(client, signed.txBlob));
    this.forgetPortfolio(entry.accountId);
    this.touchActivity();
    return result;
  }

  async discardPrepared(input: { requestId: string }): Promise<void> {
    this.prepared.delete(input.requestId);
  }

  private pruneStale(): void {
    const cutoff = Date.now() - PREPARED_TTL_MS;
    for (const [id, entry] of this.prepared) {
      if (entry.createdAt < cutoff) this.prepared.delete(id);
    }
  }

  // ------------------------------------------------------------------ faucet

  async fundTestAccount(input: { accountId: string }): Promise<void> {
    const network = this.activeNetwork();
    if (!network.isTest || !network.faucet) {
      throw new Error('Funding is only available on test networks.');
    }
    const account = this.requireAccount(input.accountId);
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      response = await fetch(network.faucet, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destination: account.address }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new Error('The faucet did not respond in time. Funding may still arrive; refresh the balance before requesting again.');
      }
      throw new Error('Could not reach the faucet. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(
        response.status === 429
          ? 'The faucet is rate limited right now. Wait a minute and try again.'
          : 'The faucet could not send test XRP. Wait a moment and try again.',
      );
    }

    this.forgetPortfolio(input.accountId);
  }

  // ---------------------------------------------------------------- contacts

  async listContacts(): Promise<readonly Contact[]> {
    return this.requirePayload().contacts;
  }

  async saveContact(input: {
    id?: string;
    label: string;
    address: string;
    destinationTag?: number;
    note?: string;
  }): Promise<Contact> {
    const label = input.label.trim();
    if (label.length === 0 || label.length > 40) {
      throw new Error('Contact names must be between 1 and 40 characters.');
    }
    const resolved = resolveDestination(input.address);
    const tag = resolved.tagIsBound ? resolved.destinationTag : input.destinationTag;
    assertDestinationTag(tag);

    const contact: Contact = {
      id: input.id ?? newId(),
      label,
      address: resolved.address,
      ...(tag === undefined ? {} : { destinationTag: tag }),
      ...(input.note ? { note: input.note.slice(0, 200) } : {}),
    };

    await this.mutatePayload((current) => ({
      ...current,
      contacts: current.contacts.some((candidate) => candidate.id === contact.id)
        ? current.contacts.map((candidate) => (candidate.id === contact.id ? contact : candidate))
        : [...current.contacts, contact],
    }));
    return contact;
  }

  async removeContact(input: { id: string }): Promise<void> {
    await this.mutatePayload((current) => ({
      ...current,
      contacts: current.contacts.filter((contact) => contact.id !== input.id),
    }));
  }

  // ------------------------------------------------------------- permissions

  async listPermissions() {
    return this.permissions.list();
  }

  async revokePermission(input: { origin: string }): Promise<void> {
    await this.permissions.revoke(input.origin);
    this.approvals.rejectForOrigin(input.origin, 'Access was revoked.');
  }

  async listApprovals(): Promise<readonly ApprovalRequest[]> {
    return this.approvals.list();
  }

  async resolveApproval(input: {
    id: string;
    approved: boolean;
    accountIds?: readonly string[];
  }): Promise<void> {
    const request = this.approvals.get(input.id);
    if (!request) throw new Error('That request is no longer waiting.');

    if (input.approved && request.kind === 'connect') {
      const accountIds = input.accountIds ?? [];
      if (accountIds.length === 0) {
        throw new Error('Choose at least one account to share.');
      }
      for (const accountId of accountIds) this.requireAccount(accountId);
      await this.permissions.grant(request.origin, accountIds);
    }

    this.approvals.resolve(input.id, {
      approved: input.approved,
      ...(input.accountIds ? { accountIds: input.accountIds } : {}),
    });
    this.touchActivity();
  }

  // -------------------------------------------------------------- provider

  /**
   * The website-facing surface.
   *
   * `senderUrl` is the URL the *browser* attributes to the sender, passed
   * straight through from `MessageSender`. It must never come from the message
   * body — that is the difference between a permission system and a suggestion.
   */
  provider(senderUrl: string | undefined) {
    const info = parseOrigin(senderUrl);
    if (!info) {
      throw new Error('Requests must come from an http(s) page.');
    }
    const { origin, hostname, isSecure } = info;

    const grantedAccounts = async (): Promise<StoredAccount[]> => {
      if (!this.isUnlocked) return [];
      const payload = this.requirePayload();
      const allowed = await this.permissions.allowedAccounts(
        origin,
        payload.accounts.map((account) => account.id),
      );
      return payload.accounts.filter((account) => allowed.includes(account.id));
    };

    return {
      ping: async () => ({ version: this.version }),

      getNetwork: async () => {
        const network = this.activeNetwork();
        return {
          networkId: network.id,
          label: network.label,
          chainId: network.networkId,
          isTest: network.isTest,
        };
      },

      getAccounts: async () => ({
        accounts: (await grantedAccounts()).map((account) => account.address),
      }),

      requestAccounts: async () => {
        const existing = await grantedAccounts();
        if (existing.length > 0) {
          await this.permissions.touch(origin);
          return { accounts: existing.map((account) => account.address) };
        }
        if (!this.isUnlocked) {
          throw new Error('Unlock Ledgerly to connect.');
        }

        const known = await this.permissions.isKnown(origin);
        const assessment = assessSite(hostname, isSecure, known);
        const request: ApprovalRequest = {
          id: newId(),
          kind: 'connect',
          origin,
          hostname,
          findings: assessment.findings,
          createdAt: Date.now(),
        };

        const outcome = await this.enqueueApproval(request);
        if (!outcome.approved) throw new ApprovalRejected();
        const granted = await grantedAccounts();
        return { accounts: granted.map((account) => account.address) };
      },

      signTransaction: async (input: { address: string; transaction: Transaction }) =>
        this.dappSign(origin, hostname, input, false),

      signAndSubmit: async (input: { address: string; transaction: Transaction }) =>
        this.dappSign(origin, hostname, input, true),

      disconnect: async () => {
        await this.permissions.revoke(origin);
        this.approvals.rejectForOrigin(origin, 'The site disconnected.');
      },
    };
  }

  private async dappSign(
    origin: string,
    hostname: string,
    input: { address: string; transaction: Transaction },
    submit: true,
  ): Promise<SubmissionResult>;
  private async dappSign(
    origin: string,
    hostname: string,
    input: { address: string; transaction: Transaction },
    submit: false,
  ): Promise<{ txBlob: string; hash: string }>;
  private async dappSign(
    origin: string,
    hostname: string,
    input: { address: string; transaction: Transaction },
    submit: boolean,
  ): Promise<SubmissionResult | { txBlob: string; hash: string }> {
    if (!this.isUnlocked) {
      throw new Error('Unlock Ledgerly to sign.');
    }
    const payload = this.requirePayload();
    const allowed = await this.permissions.allowedAccounts(
      origin,
      payload.accounts.map((account) => account.id),
    );
    const account = payload.accounts.find(
      (candidate) => candidate.address === input.address && allowed.includes(candidate.id),
    );
    if (!account) {
      throw new Error('This site does not have access to that account.');
    }

    const sanitized = sanitizeDappTransaction(input.transaction, account.address);
    const { transaction, description } = await this.connection.withClient(async (client) => {
      const prepared = await prepareTransaction(client, sanitized);
      const reserve = this.reserve ?? (await fetchReserveSchedule(client));
      this.reserve = reserve;
      const source = await fetchAccountSummary(client, account.address, reserve);
      const destinationAddress =
        'Destination' in prepared && typeof prepared.Destination === 'string'
          ? prepared.Destination
          : null;
      const destination = destinationAddress
        ? await fetchAccountSummary(client, destinationAddress, reserve)
        : undefined;
      const currentLedger = await client.getLedgerIndex().catch(() => undefined);
      return {
        transaction: prepared,
        description: describeTransaction(prepared, {
          source,
          ...(destination ? { destination } : {}),
          ...(currentLedger === undefined ? {} : { currentLedger }),
        }),
      };
    });

    const outcome = await this.enqueueApproval({
      id: newId(),
      kind: 'signTransaction',
      origin,
      hostname,
      accountId: account.id,
      address: account.address,
      transaction,
      description,
      submit,
      createdAt: Date.now(),
    });
    if (!outcome.approved) throw new ApprovalRejected();

    const signed = this.keyring.sign(account.id, transaction);
    await this.permissions.touch(origin);
    this.forgetPortfolio(account.id);

    if (!submit) return { txBlob: signed.txBlob, hash: signed.hash };
    return this.connection.withClient((client) => submitSigned(client, signed.txBlob));
  }

  private async enqueueApproval(request: ApprovalRequest) {
    const promise = this.approvals.enqueue(request);
    this.options.onApprovalRequested?.();
    return promise;
  }

  // ------------------------------------------------------------------ helpers

  private requireVault(): VaultRecord {
    if (!this.vaultRecord) throw new Error('No wallet has been set up yet.');
    return this.vaultRecord;
  }

  /**
   * Reads the unlocked payload.
   *
   * Deliberately does *not* count as activity. It used to, which meant every
   * `getState` poll pushed the auto-lock deadline out — and the interface polls
   * on every background state change, so an unattended wallet with the popup
   * open never locked at all. Only the explicit `touchActivity` calls on
   * user-initiated operations extend the session now.
   */
  private requirePayload(): VaultPayload {
    if (!this.payload) throw new Error('The wallet is locked.');
    return this.payload;
  }

  private requireAccount(accountId: string): StoredAccount {
    const account = this.requirePayload().accounts.find((candidate) => candidate.id === accountId);
    if (!account) throw new Error('No such account.');
    return account;
  }

  private resolveActiveAccountId(): string | null {
    const accounts = this.requirePayload().accounts;
    const active = this.preferences.activeAccountId;
    if (active && accounts.some((account) => account.id === active)) return active;
    return accounts[0]?.id ?? null;
  }

  private assertPasswordAcceptable(password: string): void {
    const assessment = assessPassword(password);
    if (!assessment.acceptable) {
      throw new Error(
        assessment.warnings[0] ?? `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    }
  }

  private async readStoredVault(): Promise<VaultRecord | null> {
    const stored = await this.store.get<unknown>(STORAGE_KEYS.vault);
    return isVaultRecord(stored) ? stored : null;
  }

  /**
   * The only path that writes the vault.
   *
   * Three checks stand between a write and a corrupted wallet: the record on
   * disk must still be the same vault this session belongs to, it must not
   * already be newer than what we are about to write, and the bytes must read
   * back exactly as written before the in-memory copy is updated. A write that
   * fails any of them leaves the stored vault untouched and raises, rather
   * than quietly resurrecting an older wallet.
   */
  private async writeVault(record: VaultRecord): Promise<void> {
    const stored = await this.readStoredVault();
    if (stored) {
      if (record.id && stored.id && stored.id !== record.id && this.vaultRecord) {
        throw new Error('A different wallet is already stored on this device.');
      }
      const storedGeneration = stored.generation ?? 0;
      const nextGeneration = record.generation ?? 0;
      if (record.id && stored.id === record.id && storedGeneration >= nextGeneration) {
        throw new Error(
          'This wallet changed in another tab. Reload the page so you are working from the latest copy.',
        );
      }
    }

    await this.store.set(STORAGE_KEYS.vault, record);

    const verified = await this.readStoredVault();
    if (
      !verified ||
      verified.ciphertext !== record.ciphertext ||
      verified.iv !== record.iv ||
      verified.salt !== record.salt ||
      (record.id !== undefined && verified.id !== record.id) ||
      (record.generation !== undefined && verified.generation !== record.generation)
    ) {
      throw new Error('The wallet could not be saved to this device. Nothing was changed.');
    }

    this.vaultRecord = record;
  }

  private async mutatePayload(
    update: (current: VaultPayload) => VaultPayload,
  ): Promise<VaultPayload> {
    const current = this.requirePayload();
    const record = this.requireVault();
    const key = this.sessionKey;
    if (!key) throw new Error('The wallet is locked.');

    const next = update(current);
    const resealed = await resealVault(record, key, next);
    await this.writeVault(resealed);
    this.payload = next;
    // Anything that rewrites the vault came from the user, so it counts as
    // activity and pushes the auto-lock deadline out.
    this.touchActivity();
    await this.persistSession();
    this.options.onStateChanged?.();
    return next;
  }

  private async updatePreferences(update: Partial<Preferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...update };
    await this.store.set(STORAGE_KEYS.preferences, this.preferences);
    this.options.onStateChanged?.();
  }

  /** Adopts an already-derived vault key as the session key; takes ownership of it. */
  private async openSession(payload: VaultPayload, key: Uint8Array): Promise<void> {
    if (this.sessionKey) wipe(this.sessionKey);
    this.payload = payload;
    this.sessionKey = key;
    await this.keyring.load(payload);
    await this.persistSession();
    this.scheduleAutoLock();
    this.options.onStateChanged?.();
  }

  private async persistSession(): Promise<void> {
    if (!this.payload || !this.sessionKey || this.sessionExpiresAt === null) return;
    await this.session.write({
      payload: this.payload,
      key: bytesToBase64(this.sessionKey),
      expiresAt: this.sessionExpiresAt,
      ...(this.vaultRecord?.id ? { vaultId: this.vaultRecord.id } : {}),
      ...(this.vaultRecord?.generation !== undefined
        ? { generation: this.vaultRecord.generation }
        : {}),
    });
  }

  /** Marks a user-initiated operation, pushing the auto-lock deadline out. */
  private touchActivity(): void {
    if (this.isUnlocked) this.scheduleAutoLock();
  }

  private scheduleAutoLock(): void {
    this.clearAutoLock();
    const ms = this.preferences.autoLockMinutes * 60_000;
    this.sessionExpiresAt = Date.now() + ms;
    this.lockTimer = setTimeout(() => {
      void this.lock();
    }, ms);
    void this.persistSession();
  }

  private clearAutoLock(): void {
    if (this.lockTimer !== null) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
  }
}

function newId(): string {
  return [...randomBytes(16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Maps a stored account onto the backup wording the wallet detail shows. */
function externalOf(account: StoredAccount): { provider: ExternalProviderId } | null {
  return account.source.kind === 'external' ? { provider: account.source.provider } : null;
}

function backupKindOf(account: StoredAccount): AccountBackupKind {
  if (account.source.kind === 'external') return 'external';
  if (account.source.kind === 'derived') return 'sharedPhrase';
  if (account.source.kind === 'ownPhrase') return 'ownPhrase';
  return 'imported';
}
