/**
 * The subset of the core that interface code may import.
 *
 * The full `@ledgerly/core` barrel pulls in the engine, the keyring and all of
 * xrpl.js. None of that belongs in a page bundle: the whole point of running
 * the engine in a worker is that signing code never shares a heap with the DOM.
 * This entry point carries types — which vanish at compile time — plus small
 * pure helpers for formatting and validation, so importing it cannot drag the
 * engine along by accident.
 *
 * Runtime cost here is limited to `ripple-address-codec`, which the interface
 * needs in order to validate an address as the user types it.
 */

export type {
  AccountBackupKind,
  ExternalProviderId,
  AccountSecretExport,
  AccountView,
  ImportPreview,
  SecretAlgorithm,
  ApprovalRequest,
  HistoryEntry,
  HistoryResult,
  Portfolio,
  Preferences,
  PreparedTransaction,
  RpcEvent,
  RpcRequest,
  RpcResponse,
  WalletApi,
  WalletState,
  WalletStatus,
} from './rpc/protocol';

export type { AccountFlags, AccountSummary, ReserveSchedule, TokenBalance } from './xrpl/account';
export type { ConnectionState, ConnectionStatus } from './xrpl/connection';
export type { NetworkConfig } from './xrpl/networks';
export type { SubmissionResult } from './xrpl/submit';
export type { SitePermission } from './permissions/store';
export type { Contact, StoredAccount } from './vault/schema';
export type { PasswordAssessment } from './vault/password';
export type {
  DescribedField,
  RiskFinding,
  RiskLevel,
  TransactionDescription,
} from './xrpl/describe';

export {
  addDrops,
  compareDecimal,
  currencyToDisplay,
  dropsToXrp,
  formatAmount,
  isDecimalString,
  isValidCurrencyCode,
  xrpToDrops,
} from './xrpl/amount';

export {
  isValidAddress,
  resolveDestination,
  MAX_DESTINATION_TAG,
  shortenAddress,
  toXAddress,
} from './xrpl/address';

export { highestRisk } from './xrpl/describe';
export { displayOrigin } from './permissions/origin';
export { explainEngineResult } from './xrpl/submit';
export { MIN_PASSWORD_LENGTH } from './vault/password';
