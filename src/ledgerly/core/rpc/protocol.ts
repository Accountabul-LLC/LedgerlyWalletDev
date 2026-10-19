import type { ExternalProviderId } from '../vault/schema';
import type { Transaction } from 'xrpl';
import type { AccountSummary, ReserveSchedule, TokenBalance } from '../xrpl/account';
import type { ConnectionState } from '../xrpl/connection';
import type { TransactionDescription } from '../xrpl/describe';
import type { NetworkConfig } from '../xrpl/networks';
import type { SubmissionResult } from '../xrpl/submit';
import type { RiskFinding } from '../xrpl/describe';
import type { Contact } from '../vault/schema';
import type { PasswordAssessment } from '../vault/password';
import type { SitePermission } from '../permissions/store';

export type WalletStatus = 'uninitialized' | 'locked' | 'unlocked';

export interface AccountView {
  readonly id: string;
  readonly label: string;
  readonly address: string;
  readonly isImported: boolean;
  readonly derivationIndex: number | null;
  /** How this wallet is backed up, for the wallet detail line. */
  readonly backup: AccountBackupKind;
  /** Set when the wallet lives in another app that does all the signing. */
  readonly external: { readonly provider: ExternalProviderId } | null;
}

export type { ExternalProviderId } from '../vault/schema';

/**
 * `sharedPhrase`: covered by the vault recovery phrase.
 * `ownPhrase`: has its own 24 words.
 * `imported`: a secret with no phrase coverage.
 */
export type AccountBackupKind = 'sharedPhrase' | 'ownPhrase' | 'imported' | 'external';

/** The signing curve a wallet uses; never inferred from a library default. */
export type SecretAlgorithm = 'secp256k1' | 'ed25519';

/**
 * The recovery contract for one wallet: what the secret is, how it is turned
 * into a key, and which address that must produce.
 */
export interface AccountSecretExport {
  readonly kind: 'mnemonic' | 'familySeed';
  readonly secret: string;
  readonly algorithm: SecretAlgorithm;
  /** BIP32 path for mnemonic wallets, null for a family seed. */
  readonly path: string | null;
  readonly index: number | null;
  readonly address: string;
}

/** What pasted recovery material would produce, derived locally, stored nowhere. */
export interface ImportPreview {
  readonly kind: 'mnemonic' | 'familySeed';
  readonly address: string;
  readonly algorithm: SecretAlgorithm;
  readonly path: string | null;
  readonly index: number | null;
  readonly alreadyPresent: boolean;
}

export interface Preferences {
  readonly autoLockMinutes: number;
  readonly networkId: string;
  readonly hideBalances: boolean;
  readonly showTestNetworks: boolean;
  readonly activeAccountId: string | null;
  /**
   * False until the user has seen their recovery phrase and proved they wrote
   * it down. The interface keeps them in setup while this is false, including
   * after a restart — a wallet whose phrase was never recorded is one lost
   * device away from being empty.
   */
  readonly backupConfirmed: boolean;
}

export interface WalletState {
  readonly status: WalletStatus;
  readonly accounts: readonly AccountView[];
  readonly activeAccountId: string | null;
  readonly network: NetworkConfig;
  readonly networks: readonly NetworkConfig[];
  readonly connection: ConnectionState;
  readonly preferences: Preferences;
  /** Present while unlock attempts are throttled. */
  readonly lockoutUntil: number | null;
  /**
   * Absolute time the session auto-locks, or null when locked. Hosts schedule
   * their own timer from this rather than re-arming a full-duration one on
   * every request, which would postpone the lock indefinitely.
   */
  readonly sessionExpiresAt: number | null;
  readonly pendingApprovals: number;
}

export interface Portfolio {
  readonly summary: AccountSummary;
  readonly reserve: ReserveSchedule;
  readonly tokens: readonly TokenBalance[];
  readonly fetchedAt: number;
}

export interface HistoryEntry {
  readonly hash: string;
  readonly type: string;
  readonly direction: 'in' | 'out' | 'self';
  readonly headline: string;
  readonly amount: string | null;
  readonly counterparty: string | null;
  readonly timestamp: number | null;
  readonly succeeded: boolean;
  readonly feeXrp: string;
}

export interface HistoryResult {
  readonly entries: readonly HistoryEntry[];
  readonly marker: unknown;
}

export interface PreparedTransaction {
  readonly requestId: string;
  readonly transaction: Transaction;
  readonly description: TransactionDescription;
}

export type ApprovalRequest =
  | {
      readonly id: string;
      readonly kind: 'connect';
      readonly origin: string;
      readonly hostname: string;
      readonly findings: readonly RiskFinding[];
      readonly createdAt: number;
    }
  | {
      readonly id: string;
      readonly kind: 'signTransaction';
      readonly origin: string;
      readonly hostname: string;
      readonly accountId: string;
      readonly address: string;
      readonly transaction: Transaction;
      readonly description: TransactionDescription;
      readonly submit: boolean;
      readonly createdAt: number;
    };

/**
 * Methods reachable only from the extension's own pages.
 *
 * The transport that serves this map verifies the sender is the extension
 * itself. A website reaching `exportRecoveryPhrase` would end the story, so
 * these never share a channel with the provider API below.
 */
export interface WalletApi {
  getState(): Promise<WalletState>;

  createWallet(input: { password: string; mnemonic?: string }): Promise<{ mnemonic: string }>;
  importFromSeed(input: { password: string; seed: string; label?: string }): Promise<void>;
  unlock(input: { password: string }): Promise<void>;
  lock(): Promise<void>;
  resetWallet(input: { confirmation: string }): Promise<void>;

  assessPassword(input: { password: string }): Promise<PasswordAssessment>;
  changePassword(input: { current: string; next: string }): Promise<void>;
  /** Password-gated and returns the phrase once; never cached by the UI. */
  exportRecoveryPhrase(input: { password: string }): Promise<{ mnemonic: string }>;
  /** Records that the user has verified their recovery phrase. */
  confirmBackup(): Promise<void>;
  exportAccountSeed(input: { password: string; accountId: string }): Promise<{ seed: string }>;
  /** Password-gated export of whatever material actually recreates one wallet. */
  exportAccountSecret(input: {
    password: string;
    accountId: string;
  }): Promise<AccountSecretExport>;
  /** Derives an address from pasted material without storing it. */
  previewImport(input: { secret: string }): Promise<ImportPreview>;

  /** Derives the next address without committing it, for the confirm step. */
  previewNextAccount(): Promise<{ address: string; index: number }>;
  addAccount(input: { label?: string; expectedAddress?: string }): Promise<AccountView>;
  /** Generates a fresh 24 word phrase for an unlinked wallet, without storing it. */
  generateRecoveryPhrase(): Promise<{ mnemonic: string }>;
  /** Creates a wallet with its own recovery phrase, unlinked from the vault phrase. */
  addAccountWithOwnPhrase(input: {
    label?: string;
    mnemonic: string;
    expectedAddress?: string;
  }): Promise<AccountView>;
  importAccount(input: {
    seed: string;
    label?: string;
    expectedAddress?: string;
  }): Promise<AccountView>;
  /**
   * Adds a wallet held in another app by address only. No secret is provided,
   * accepted or stored: the outside wallet keeps the key and does the signing.
   */
  connectExternalAccount(input: {
    provider: ExternalProviderId;
    address: string;
    label?: string;
  }): Promise<AccountView>;
  renameAccount(input: { accountId: string; label: string }): Promise<void>;
  removeAccount(input: { accountId: string; acknowledged?: boolean }): Promise<void>;
  selectAccount(input: { accountId: string }): Promise<void>;

  setNetwork(input: { networkId: string }): Promise<void>;
  addCustomNetwork(input: { label: string; endpoint: string; networkId: number }): Promise<NetworkConfig>;
  removeCustomNetwork(input: { networkId: string }): Promise<void>;

  setPreferences(
    input: Partial<Omit<Preferences, 'activeAccountId' | 'networkId' | 'backupConfirmed'>>,
  ): Promise<void>;

  getPortfolio(input: { accountId: string; refresh?: boolean }): Promise<Portfolio>;
  getHistory(input: { accountId: string; marker?: unknown }): Promise<HistoryResult>;

  preparePayment(input: {
    accountId: string;
    destination: string;
    destinationTag?: number;
    amount:
      | { kind: 'xrp'; value: string }
      | { kind: 'token'; value: string; currency: string; issuer: string };
    memo?: string;
  }): Promise<PreparedTransaction>;
  prepareTrustSet(input: {
    accountId: string;
    currency: string;
    issuer: string;
    limit: string;
  }): Promise<PreparedTransaction>;
  /** Signs and submits a transaction the user prepared inside the wallet. */
  confirmPrepared(input: { requestId: string }): Promise<SubmissionResult>;
  discardPrepared(input: { requestId: string }): Promise<void>;

  listContacts(): Promise<readonly Contact[]>;
  saveContact(input: {
    id?: string;
    label: string;
    address: string;
    destinationTag?: number;
    note?: string;
  }): Promise<Contact>;
  removeContact(input: { id: string }): Promise<void>;

  listPermissions(): Promise<readonly SitePermission[]>;
  revokePermission(input: { origin: string }): Promise<void>;

  listApprovals(): Promise<readonly ApprovalRequest[]>;
  resolveApproval(input: {
    id: string;
    approved: boolean;
    accountIds?: readonly string[];
  }): Promise<void>;

  fundTestAccount(input: { accountId: string }): Promise<void>;
}

/**
 * Methods a connected website can invoke.
 *
 * Every one of these is origin-scoped by the transport, which supplies the
 * origin from the browser's sender metadata. Nothing here can read a key,
 * export a phrase, change a setting, or reach an account the origin was not
 * granted.
 */
export interface ProviderApi {
  ping(): Promise<{ version: string }>;
  getNetwork(): Promise<{ networkId: string; label: string; chainId: number; isTest: boolean }>;
  /** Resolves to already-granted accounts, or opens an approval window. */
  requestAccounts(): Promise<{ accounts: readonly string[] }>;
  /** Returns granted accounts without prompting; empty when not connected. */
  getAccounts(): Promise<{ accounts: readonly string[] }>;
  signTransaction(input: { address: string; transaction: Transaction }): Promise<{
    txBlob: string;
    hash: string;
  }>;
  signAndSubmit(input: { address: string; transaction: Transaction }): Promise<SubmissionResult>;
  disconnect(): Promise<void>;
}

export type WalletMethod = keyof WalletApi;
export type ProviderMethod = keyof ProviderApi;

/**
 * The privileged methods a host may dispatch.
 *
 * Both hosts used to keep their own copy of this list, which meant a method
 * added to `WalletApi` could be reachable in one and missing in the other. The
 * exhaustiveness check below turns any such drift into a compile error rather
 * than a runtime surprise, and dispatching against a list rather than looking
 * up an arbitrary property keeps engine internals unreachable.
 */
export const WALLET_METHODS = [
  'getState',
  'createWallet',
  'importFromSeed',
  'unlock',
  'lock',
  'resetWallet',
  'assessPassword',
  'changePassword',
  'exportRecoveryPhrase',
  'exportAccountSeed',
  'exportAccountSecret',
  'previewImport',
  'confirmBackup',
  'previewNextAccount',
  'addAccount',
  'generateRecoveryPhrase',
  'addAccountWithOwnPhrase',
  'importAccount',
  'connectExternalAccount',
  'renameAccount',
  'removeAccount',
  'selectAccount',
  'setNetwork',
  'addCustomNetwork',
  'removeCustomNetwork',
  'setPreferences',
  'getPortfolio',
  'getHistory',
  'preparePayment',
  'prepareTrustSet',
  'confirmPrepared',
  'discardPrepared',
  'listContacts',
  'saveContact',
  'removeContact',
  'listPermissions',
  'revokePermission',
  'listApprovals',
  'resolveApproval',
  'fundTestAccount',
] as const satisfies readonly WalletMethod[];

/** Fails to compile if a `WalletApi` method is missing from the list above. */
type UncoveredWalletMethod = Exclude<WalletMethod, (typeof WALLET_METHODS)[number]>;
const _walletMethodsAreExhaustive: UncoveredWalletMethod extends never ? true : never = true;
void _walletMethodsAreExhaustive;

const WALLET_METHOD_SET: ReadonlySet<string> = new Set(WALLET_METHODS);

export function isWalletMethod(value: unknown): value is WalletMethod {
  return typeof value === 'string' && WALLET_METHOD_SET.has(value);
}

export const PROVIDER_METHODS: readonly ProviderMethod[] = [
  'ping',
  'getNetwork',
  'requestAccounts',
  'getAccounts',
  'signTransaction',
  'signAndSubmit',
  'disconnect',
];

export function isProviderMethod(value: unknown): value is ProviderMethod {
  return typeof value === 'string' && (PROVIDER_METHODS as readonly string[]).includes(value);
}

export interface RpcRequest {
  readonly id: string;
  readonly method: string;
  readonly params?: unknown;
}

export type RpcResponse =
  | { readonly id: string; readonly ok: true; readonly result: unknown }
  | { readonly id: string; readonly ok: false; readonly error: { code: string; message: string } };

export interface RpcEvent {
  readonly event: string;
  readonly payload: unknown;
}
