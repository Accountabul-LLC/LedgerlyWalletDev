import type { Payment, Transaction, TrustSet } from 'xrpl';
import { convertStringToHex } from 'xrpl';
import {
  assertIssuedPrecision,
  compareDecimal,
  currencyToHex,
  isValidCurrencyCode,
  xrpToDrops,
} from './amount';
import { assertDestinationTag, resolveDestination } from './address';

export type AmountRequest =
  | { readonly kind: 'xrp'; readonly value: string }
  | {
      readonly kind: 'token';
      readonly value: string;
      readonly currency: string;
      readonly issuer: string;
    };

export interface PaymentRequest {
  readonly from: string;
  readonly destination: string;
  readonly destinationTag?: number;
  readonly amount: AmountRequest;
  readonly memo?: string;
  /**
   * Whether the wallet is pointed at a test network. X-addresses encode which
   * side of that line they belong to, so this is compared against the address
   * to catch a Testnet address pasted into a Mainnet send.
   */
  readonly expectTestNetwork?: boolean;
}

export interface TrustSetRequest {
  readonly from: string;
  readonly currency: string;
  readonly issuer: string;
  /** '0' removes the line, provided its balance is already zero. */
  readonly limit: string;
}

const MAX_MEMO_BYTES = 1024;

/**
 * Builds a Payment.
 *
 * No flags are set. `tfPartialPayment` in particular is left off deliberately:
 * with it, the ledger may deliver less than `Amount` while still reporting
 * success, which is the classic exchange-deposit exploit. The wallet never
 * originates a partial payment, and `describe.ts` raises a warning if one
 * arrives from a dApp.
 */
export function buildPayment(request: PaymentRequest): Payment {
  const destination = resolveDestination(request.destination);

  // An X-address states the network it belongs to. A classic address does not,
  // so there is nothing to check there — but when the marker is present and
  // disagrees, the payment would be sent to an address the recipient does not
  // control on this network, and the funds would be unrecoverable.
  if (destination.tagIsBound && request.expectTestNetwork !== undefined) {
    if (destination.isTestAddress && !request.expectTestNetwork) {
      throw new Error(
        'That address belongs to a test network, but this wallet is on the main network. Sending there would lose the funds.',
      );
    }
    if (!destination.isTestAddress && request.expectTestNetwork) {
      throw new Error(
        'That address belongs to the main network, but this wallet is on a test network.',
      );
    }
  }

  if (destination.tagIsBound && request.destinationTag !== undefined) {
    if (destination.destinationTag !== request.destinationTag) {
      throw new Error(
        'This X-address already carries a destination tag that differs from the one entered.',
      );
    }
  }
  const tag = destination.tagIsBound ? destination.destinationTag : request.destinationTag;
  assertDestinationTag(tag);

  if (destination.address === request.from) {
    throw new Error('The destination is the same as the sending account.');
  }

  const payment: Payment = {
    TransactionType: 'Payment',
    Account: request.from,
    Destination: destination.address,
    Amount: encodeAmount(request.amount),
  };

  if (tag !== undefined) payment.DestinationTag = tag;

  const memo = request.memo?.trim();
  if (memo) {
    const encoded = convertStringToHex(memo);
    if (encoded.length / 2 > MAX_MEMO_BYTES) {
      throw new Error('That memo is too long.');
    }
    payment.Memos = [{ Memo: { MemoData: encoded, MemoFormat: convertStringToHex('text/plain') } }];
  }

  return payment;
}

function encodeAmount(amount: AmountRequest): Payment['Amount'] {
  if (amount.kind === 'xrp') {
    const drops = xrpToDrops(amount.value);
    if (BigInt(drops) <= 0n) {
      throw new Error('Enter an amount greater than zero.');
    }
    return drops;
  }

  if (!isValidCurrencyCode(amount.currency)) {
    throw new Error('That currency code is not valid.');
  }
  if (amount.currency.toUpperCase() === 'XRP') {
    throw new Error('XRP cannot be sent as an issued token.');
  }
  resolveDestination(amount.issuer);
  assertIssuedPrecision(amount.value);
  if (compareDecimal(amount.value, '0') <= 0) {
    throw new Error('Enter an amount greater than zero.');
  }

  return {
    currency: currencyToHex(amount.currency),
    issuer: amount.issuer,
    value: amount.value,
  };
}

/**
 * Builds a TrustSet.
 *
 * `tfSetNoRipple` is applied on every line the wallet creates. Without it, an
 * account holding two tokens from the same issuer can be used as a rippling
 * bridge between third parties, moving its balances without any transaction
 * the user signed.
 */
export function buildTrustSet(request: TrustSetRequest): TrustSet {
  if (!isValidCurrencyCode(request.currency)) {
    throw new Error('That currency code is not valid.');
  }
  if (request.currency.toUpperCase() === 'XRP') {
    throw new Error('XRP does not use trust lines.');
  }
  resolveDestination(request.issuer);
  if (request.issuer === request.from) {
    throw new Error('An account cannot set a trust line to itself.');
  }
  assertIssuedPrecision(request.limit);
  if (compareDecimal(request.limit, '0') < 0) {
    throw new Error('A trust limit cannot be negative.');
  }

  return {
    TransactionType: 'TrustSet',
    Account: request.from,
    LimitAmount: {
      currency: currencyToHex(request.currency),
      issuer: request.issuer,
      value: request.limit,
    },
    Flags: TRUST_SET_NO_RIPPLE,
  };
}

/** `tfSetNoRipple` */
const TRUST_SET_NO_RIPPLE = 0x00020000;

const ALLOWED_TRANSACTION_TYPES = new Set([
  'Payment',
  'TrustSet',
  'AccountSet',
  'OfferCreate',
  'OfferCancel',
  'NFTokenCreateOffer',
  'NFTokenAcceptOffer',
  'NFTokenCancelOffer',
  'NFTokenBurn',
  'NFTokenMint',
  'CheckCash',
  'CheckCancel',
  'CheckCreate',
  'EscrowCreate',
  'EscrowFinish',
  'EscrowCancel',
  'PaymentChannelCreate',
  'PaymentChannelFund',
  'PaymentChannelClaim',
  'DepositPreauth',
  'TicketCreate',
]);

/**
 * Gate for transactions arriving from a connected site.
 *
 * The blocklist is what matters here. `AccountDelete` empties the account,
 * `SetRegularKey` and `SignerListSet` hand over signing authority, and none of
 * the three has a legitimate reason to originate from a web page — a user who
 * wants them can reach them through the wallet's own settings, where the
 * consequences are spelled out.
 */
export function assertDappTransactionAllowed(transaction: Transaction): void {
  const type = transaction.TransactionType;
  if (type === 'AccountDelete' || type === 'SetRegularKey' || type === 'SignerListSet') {
    throw new Error(
      `${type} changes who controls this account and cannot be requested by a website.`,
    );
  }
  if (!ALLOWED_TRANSACTION_TYPES.has(type)) {
    throw new Error(`Ledgerly does not support signing ${type} from a website.`);
  }
}

/**
 * A dApp supplies the transaction body; the wallet decides who signs it. Any
 * `Account` the site sets is discarded, so a site cannot ask the wallet to sign
 * on behalf of an account the user did not choose, and pre-set signature fields
 * are stripped so nothing survives into the blob unverified.
 */
export function sanitizeDappTransaction(transaction: Transaction, account: string): Transaction {
  assertDappTransactionAllowed(transaction);
  const {
    TxnSignature: _signature,
    Signers: _signers,
    SigningPubKey: _pubKey,
    ...rest
  } = transaction as Transaction & Record<string, unknown>;
  return { ...rest, Account: account } as Transaction;
}
