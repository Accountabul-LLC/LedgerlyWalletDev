import type { AccountInfoResponse, AccountLinesResponse, AccountTxResponse, Client } from 'xrpl';
import { currencyToDisplay, dropsToXrp, subtractDropsToZero } from './amount';

export interface ReserveSchedule {
  /** Drops locked for the account itself. */
  readonly baseDrops: string;
  /** Drops locked per owned ledger object. */
  readonly incrementDrops: string;
}

export interface AccountFlags {
  readonly requireDestinationTag: boolean;
  readonly disallowIncomingXrp: boolean;
  readonly requireAuth: boolean;
  readonly globalFreeze: boolean;
  readonly disableMasterKey: boolean;
  readonly depositAuth: boolean;
}

export interface AccountSummary {
  readonly address: string;
  /** False until the account is funded past the base reserve; it has no ledger entry yet. */
  readonly exists: boolean;
  readonly balanceDrops: string;
  readonly ownerCount: number;
  readonly sequence: number;
  readonly reserveDrops: string;
  readonly spendableDrops: string;
  readonly flags: AccountFlags;
  readonly regularKeySet: boolean;
}

export interface TokenBalance {
  readonly currency: string;
  readonly display: string;
  readonly issuer: string;
  readonly balance: string;
  readonly limit: string;
  readonly frozen: boolean;
  readonly noRipple: boolean;
  /** True when the balance is negative, meaning this account is the issuer of the debt. */
  readonly isObligation: boolean;
}

const ACCOUNT_FLAG_BITS = {
  requireDestinationTag: 0x00020000,
  requireAuth: 0x00040000,
  disallowIncomingXrp: 0x00080000,
  disableMasterKey: 0x00100000,
  globalFreeze: 0x00400000,
  depositAuth: 0x01000000,
} as const;

/**
 * Reserve amounts are decided by validator vote and have been lowered twice,
 * so they are read from the connected server rather than hardcoded. Using a
 * stale figure would either block sends the ledger would accept or, worse,
 * let the wallet propose a send that fails with `tecUNFUNDED`.
 */
export async function fetchReserveSchedule(client: Client): Promise<ReserveSchedule> {
  const response = await client.request({ command: 'server_state' });
  const ledger = response.result.state.validated_ledger;
  if (!ledger) {
    throw new Error('The server has no validated ledger yet.');
  }
  return {
    baseDrops: String(ledger.reserve_base),
    incrementDrops: String(ledger.reserve_inc),
  };
}

export async function fetchAccountSummary(
  client: Client,
  address: string,
  reserve: ReserveSchedule,
): Promise<AccountSummary> {
  let response: AccountInfoResponse;
  try {
    response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });
  } catch (error) {
    if (isAccountNotFound(error)) {
      return unfundedAccount(address, reserve);
    }
    throw error;
  }

  const data = response.result.account_data;
  const ownerCount = data.OwnerCount ?? 0;
  const reserveDrops = (
    BigInt(reserve.baseDrops) +
    BigInt(reserve.incrementDrops) * BigInt(ownerCount)
  ).toString();
  const balanceDrops = String(data.Balance);

  return {
    address,
    exists: true,
    balanceDrops,
    ownerCount,
    sequence: data.Sequence,
    reserveDrops,
    spendableDrops: subtractDropsToZero(balanceDrops, reserveDrops),
    flags: readFlags(typeof data.Flags === 'number' ? data.Flags : 0),
    regularKeySet: typeof data.RegularKey === 'string' && data.RegularKey.length > 0,
  };
}

function unfundedAccount(address: string, reserve: ReserveSchedule): AccountSummary {
  return {
    address,
    exists: false,
    balanceDrops: '0',
    ownerCount: 0,
    sequence: 0,
    reserveDrops: reserve.baseDrops,
    spendableDrops: '0',
    flags: readFlags(0),
    regularKeySet: false,
  };
}

function readFlags(flags: number): AccountFlags {
  return {
    requireDestinationTag: (flags & ACCOUNT_FLAG_BITS.requireDestinationTag) !== 0,
    disallowIncomingXrp: (flags & ACCOUNT_FLAG_BITS.disallowIncomingXrp) !== 0,
    requireAuth: (flags & ACCOUNT_FLAG_BITS.requireAuth) !== 0,
    globalFreeze: (flags & ACCOUNT_FLAG_BITS.globalFreeze) !== 0,
    disableMasterKey: (flags & ACCOUNT_FLAG_BITS.disableMasterKey) !== 0,
    depositAuth: (flags & ACCOUNT_FLAG_BITS.depositAuth) !== 0,
  };
}

/**
 * An account with no ledger entry has no trust lines, and `account_lines`
 * reports that as an error rather than an empty list. Letting it propagate
 * failed the whole portfolio fetch for every unfunded account, which hid the
 * activation guidance behind a raw error message.
 */
export async function fetchTokenBalances(client: Client, address: string): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = [];
  let marker: unknown;

  do {
    let response: AccountLinesResponse;
    try {
      response = await client.request({
        command: 'account_lines',
        account: address,
        ledger_index: 'validated',
        limit: 200,
        ...(marker === undefined ? {} : { marker }),
      });
    } catch (error) {
      if (isAccountNotFound(error)) return [];
      throw error;
    }

    for (const line of response.result.lines) {
      balances.push({
        currency: line.currency,
        display: currencyToDisplay(line.currency),
        issuer: line.account,
        balance: line.balance,
        limit: line.limit,
        // A freeze set by either side stops the balance from moving, so both matter.
        frozen: line.freeze === true || line.freeze_peer === true,
        noRipple: line.no_ripple === true,
        isObligation: line.balance.startsWith('-'),
      });
    }
    marker = response.result.marker;
  } while (marker !== undefined);

  return balances;
}

export interface HistoryPage {
  readonly entries: readonly AccountTxResponse['result']['transactions'][number][];
  readonly marker: unknown;
}

export async function fetchHistoryPage(
  client: Client,
  address: string,
  limit: number,
  marker?: unknown,
): Promise<HistoryPage> {
  try {
    const response: AccountTxResponse = await client.request({
      command: 'account_tx',
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      forward: false,
      limit,
      ...(marker === undefined ? {} : { marker }),
    });
    return { entries: response.result.transactions, marker: response.result.marker };
  } catch (error) {
    // An account that does not exist yet simply has no history.
    if (isAccountNotFound(error)) return { entries: [], marker: undefined };
    throw error;
  }
}

export function reserveBreakdown(summary: AccountSummary, reserve: ReserveSchedule) {
  return {
    baseXrp: dropsToXrp(reserve.baseDrops),
    ownerCount: summary.ownerCount,
    ownerXrp: dropsToXrp(
      (BigInt(reserve.incrementDrops) * BigInt(summary.ownerCount)).toString(),
    ),
    totalXrp: dropsToXrp(summary.reserveDrops),
  };
}

function isAccountNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { data?: { error?: string }; message?: string };
  return candidate.data?.error === 'actNotFound' || candidate.message === 'Account not found.';
}
