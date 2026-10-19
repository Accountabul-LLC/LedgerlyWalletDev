import type { IssuedCurrencyAmount, Transaction } from 'xrpl';
import { compareDecimal, currencyToDisplay, dropsToXrp, formatAmount } from './amount';
import { shortenAddress } from './address';
import type { AccountSummary } from './account';

export type RiskLevel = 'info' | 'caution' | 'danger';

export interface RiskFinding {
  readonly level: RiskLevel;
  readonly title: string;
  readonly detail: string;
}

export interface DescribedField {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}

export interface TransactionDescription {
  readonly type: string;
  readonly headline: string;
  readonly summary: string;
  readonly fields: readonly DescribedField[];
  readonly findings: readonly RiskFinding[];
  readonly feeXrp: string;
}

export interface DescribeContext {
  /** The signing account, used to compare the amount against what it holds. */
  readonly source?: AccountSummary;
  /** The destination as it currently exists on the ledger, when it was looked up. */
  readonly destination?: AccountSummary;
  /** Current validated ledger index, used to judge how long the transaction stays valid. */
  readonly currentLedger?: number;
}

const TF_PARTIAL_PAYMENT = 0x00020000;
const ASF_DISABLE_MASTER = 4;
const ASF_REQUIRE_DEST = 1;
const ASF_NO_FREEZE = 6;
const ASF_GLOBAL_FREEZE = 7;

/**
 * A trillion units. Issued amounts carry at most 15 significant digits, so a
 * limit at this scale is a formality rather than a cap on anything the user
 * would knowingly accept.
 */
const EFFECTIVELY_UNLIMITED_TRUST = '1000000000000';

const FEE_CAUTION_DROPS = 100_000n;
const FEE_DANGER_DROPS = 1_000_000n;

/**
 * Turns a signable transaction into what the approval screen shows.
 *
 * This is the last point at which a person can catch a hostile request, so it
 * describes what the transaction *does* rather than echoing its fields, and it
 * is written to work on a fully autofilled transaction — the exact object that
 * will be signed, not an earlier draft.
 */
export function describeTransaction(
  transaction: Transaction,
  context: DescribeContext = {},
): TransactionDescription {
  const findings: RiskFinding[] = [];
  const fields: DescribedField[] = [];
  const feeDrops = normaliseDrops(transaction.Fee);

  checkFee(feeDrops, findings);
  checkExpiry(transaction, context.currentLedger, findings);

  // A site supplies this object, so its fields may be any shape at all. A throw
  // here would take down the approval screen — the one place a person can still
  // refuse — so a body that cannot be interpreted degrades to the raw view with
  // a warning rather than failing.
  let body: Body;
  try {
    body = describeBody(transaction, context, fields, findings);
  } catch {
    findings.push({
      level: 'danger',
      title: 'This transaction could not be interpreted',
      detail:
        'Ledgerly could not make sense of the fields this request contains. Do not approve it unless you understand the raw transaction shown below.',
    });
    body = {
      headline: humanizeType(String(transaction.TransactionType ?? 'Unknown transaction')),
      summary: 'Unrecognised transaction contents.',
    };
  }

  fields.push({ label: 'Network fee', value: `${formatAmount(dropsToXrp(feeDrops))} XRP` });
  if (typeof transaction.Sequence === 'number') {
    fields.push({ label: 'Sequence', value: String(transaction.Sequence) });
  }

  return {
    type: transaction.TransactionType,
    headline: body.headline,
    summary: body.summary,
    fields,
    findings,
    feeXrp: dropsToXrp(feeDrops),
  };
}

interface Body {
  readonly headline: string;
  readonly summary: string;
}

function describeBody(
  transaction: Transaction,
  context: DescribeContext,
  fields: DescribedField[],
  findings: RiskFinding[],
): Body {
  switch (transaction.TransactionType) {
    case 'Payment':
      return describePayment(transaction, context, fields, findings);
    case 'TrustSet':
      return describeTrustSet(transaction, fields, findings);
    case 'AccountSet':
      return describeAccountSet(transaction, fields, findings);
    case 'OfferCreate':
      return describeOfferCreate(transaction, fields);
    case 'OfferCancel':
      fields.push({ label: 'Offer sequence', value: String(transaction.OfferSequence) });
      return { headline: 'Cancel offer', summary: 'Removes an open order from the decentralised exchange.' };
    case 'NFTokenMint':
      return { headline: 'Mint an NFT', summary: 'Creates a new non-fungible token owned by this account.' };
    case 'NFTokenBurn':
      return {
        headline: 'Burn an NFT',
        summary: 'Permanently destroys a token. This cannot be undone.',
      };
    case 'NFTokenAcceptOffer':
      return { headline: 'Accept an NFT offer', summary: 'Completes a token trade.' };
    default:
      return {
        headline: humanizeType(transaction.TransactionType),
        summary: 'Review the raw fields below before approving.',
      };
  }
}

function describePayment(
  transaction: Extract<Transaction, { TransactionType: 'Payment' }>,
  context: DescribeContext,
  fields: DescribedField[],
  findings: RiskFinding[],
): Body {
  const amount = formatAmountValue(transaction.Amount);
  fields.push({ label: 'Amount', value: amount });
  fields.push({ label: 'To', value: transaction.Destination, mono: true });

  if (transaction.DestinationTag !== undefined) {
    fields.push({ label: 'Destination tag', value: String(transaction.DestinationTag) });
  }

  const flags = typeof transaction.Flags === 'number' ? transaction.Flags : 0;
  if ((flags & TF_PARTIAL_PAYMENT) !== 0) {
    findings.push({
      level: 'danger',
      title: 'Partial payment enabled',
      detail:
        'The ledger may deliver less than the amount shown while still reporting success. Only approve this if you understand exactly why the site is asking for it.',
    });
  }

  if (transaction.SendMax !== undefined) {
    const sendMax = formatAmountValue(transaction.SendMax);
    fields.push({ label: 'Maximum spent', value: sendMax });
    findings.push({
      level: 'caution',
      title: 'Cross-currency payment',
      detail: `You may spend up to ${sendMax} to deliver ${amount}.`,
    });
  }

  if (Array.isArray(transaction.Paths) && transaction.Paths.length > 0) {
    findings.push({
      level: 'caution',
      title: 'Routed through the exchange',
      detail: 'This payment converts through third-party order books on its way to the destination.',
    });
  }

  const destination = context.destination;
  if (destination && !destination.exists) {
    findings.push({
      level: 'info',
      title: 'Destination is a new account',
      detail:
        'This address holds no XRP yet. The payment must meet the base reserve or the ledger will reject it.',
    });
  }
  if (destination?.flags.requireDestinationTag && transaction.DestinationTag === undefined) {
    findings.push({
      level: 'danger',
      title: 'Destination tag required',
      detail:
        'This account requires a destination tag. Sending without one will fail, and on an exchange it is how deposits go missing.',
    });
  }

  checkSpendsEverything(transaction.Amount, context, findings);

  return {
    headline: `Send ${amount}`,
    summary: `To ${shortenAddress(transaction.Destination)}`,
  };
}

function describeTrustSet(
  transaction: Extract<Transaction, { TransactionType: 'TrustSet' }>,
  fields: DescribedField[],
  findings: RiskFinding[],
): Body {
  const limit = transaction.LimitAmount as IssuedCurrencyAmount;
  const token = currencyToDisplay(limit.currency);
  fields.push({ label: 'Token', value: token });
  fields.push({ label: 'Issuer', value: limit.issuer, mono: true });
  fields.push({ label: 'Limit', value: limit.value === '0' ? 'None (removing)' : formatAmount(limit.value) });

  if (limit.value === '0') {
    return {
      headline: `Remove ${token} trust line`,
      summary: 'Frees the 0.2 XRP reserve this line holds. Only works if the balance is zero.',
    };
  }

  findings.push({
    level: 'info',
    title: 'Reserve increases',
    detail: 'Each trust line locks 0.2 XRP of your balance until the line is removed.',
  });

  // A limit this large accepts essentially any quantity the issuer cares to
  // send, which is how holders end up with dust tokens they never asked for.
  if (compareDecimal(limit.value, EFFECTIVELY_UNLIMITED_TRUST) >= 0) {
    findings.push({
      level: 'caution',
      title: 'Trust limit is effectively unlimited',
      detail: `This lets ${shortenAddress(limit.issuer)} issue you an unbounded amount of ${token}. Set a limit you would actually accept.`,
    });
  }

  return {
    headline: `Trust ${token}`,
    summary: `Lets you hold ${token} issued by ${shortenAddress(limit.issuer)}.`,
  };
}

function describeAccountSet(
  transaction: Extract<Transaction, { TransactionType: 'AccountSet' }>,
  fields: DescribedField[],
  findings: RiskFinding[],
): Body {
  const setFlag = transaction.SetFlag;
  const clearFlag = transaction.ClearFlag;

  if (setFlag === ASF_DISABLE_MASTER) {
    findings.push({
      level: 'danger',
      title: 'Disables your master key',
      detail:
        'After this, your recovery phrase alone can no longer sign for this account. If no working regular key or signer list is in place, the funds become permanently unreachable.',
    });
    return { headline: 'Disable master key', summary: 'Irreversible change to account control.' };
  }
  if (setFlag === ASF_NO_FREEZE || setFlag === ASF_GLOBAL_FREEZE) {
    findings.push({
      level: 'danger',
      title: 'Issuer freeze setting',
      detail: 'This permanently changes how tokens you issue can be frozen and cannot be undone.',
    });
  }
  if (setFlag === ASF_REQUIRE_DEST) {
    fields.push({ label: 'Change', value: 'Require a destination tag on incoming payments' });
  }
  if (setFlag !== undefined) fields.push({ label: 'Set flag', value: String(setFlag) });
  if (clearFlag !== undefined) fields.push({ label: 'Clear flag', value: String(clearFlag) });

  return { headline: 'Change account settings', summary: 'Updates options on your XRPL account.' };
}

function describeOfferCreate(
  transaction: Extract<Transaction, { TransactionType: 'OfferCreate' }>,
  fields: DescribedField[],
): Body {
  const pays = formatAmountValue(transaction.TakerPays);
  const gets = formatAmountValue(transaction.TakerGets);
  fields.push({ label: 'You give', value: gets });
  fields.push({ label: 'You receive', value: pays });
  return { headline: 'Place an exchange order', summary: `Trade ${gets} for ${pays}.` };
}

/** A fee that is not a plain drops string is treated as unknown rather than parsed. */
function normaliseDrops(value: unknown): string {
  return typeof value === 'string' && /^\d+$/.test(value) ? value : '0';
}

function checkFee(feeDrops: string, findings: RiskFinding[]): void {
  let fee: bigint;
  try {
    fee = BigInt(feeDrops);
  } catch {
    return;
  }
  if (fee >= FEE_DANGER_DROPS) {
    findings.push({
      level: 'danger',
      title: 'Very high network fee',
      detail: `This transaction burns ${formatAmount(dropsToXrp(feeDrops))} XRP in fees. A normal fee is a small fraction of one XRP.`,
    });
  } else if (fee >= FEE_CAUTION_DROPS) {
    findings.push({
      level: 'caution',
      title: 'Elevated network fee',
      detail: `The fee is ${formatAmount(dropsToXrp(feeDrops))} XRP, higher than usual. The network may be under load.`,
    });
  }
}

/** Roughly an hour of ledgers. Beyond this, an expiry is not meaningfully an expiry. */
const MAX_REASONABLE_LEDGER_WINDOW = 1000;

/**
 * A transaction with no `LastLedgerSequence` stays valid indefinitely. It can
 * sit unconfirmed and then execute much later, against a balance the user has
 * since spent.
 *
 * A site setting the field to an enormous value achieves the same thing while
 * appearing to set an expiry, so the window is measured rather than merely
 * checked for presence.
 */
function checkExpiry(
  transaction: Transaction,
  currentLedger: number | undefined,
  findings: RiskFinding[],
): void {
  const last = transaction.LastLedgerSequence;
  if (last === undefined) {
    findings.push({
      level: 'caution',
      title: 'No expiry set',
      detail: 'This transaction never expires and could be submitted long after you approve it.',
    });
    return;
  }

  if (currentLedger === undefined || typeof last !== 'number') return;
  if (last - currentLedger > MAX_REASONABLE_LEDGER_WINDOW) {
    findings.push({
      level: 'caution',
      title: 'Expires unusually far in the future',
      detail:
        'This transaction stays valid for a long time, so it could be held back and submitted much later against a balance you have since spent.',
    });
  }
}

function checkSpendsEverything(
  amount: unknown,
  context: DescribeContext,
  findings: RiskFinding[],
): void {
  const source = context.source;
  if (!source || typeof amount !== 'string') return;
  const spendable = BigInt(source.spendableDrops);
  if (spendable === 0n) return;
  if (BigInt(amount) >= spendable) {
    findings.push({
      level: 'caution',
      title: 'Spends your entire available balance',
      detail:
        'This leaves nothing above the account reserve, so later transaction fees will fail until you top up.',
    });
  }
}

export function formatAmountValue(amount: unknown): string {
  if (typeof amount === 'string') {
    return `${formatAmount(dropsToXrp(amount))} XRP`;
  }
  if (typeof amount === 'object' && amount !== null) {
    if ('currency' in amount) {
      const issued = amount as IssuedCurrencyAmount;
      return `${formatAmount(issued.value, 8)} ${currencyToDisplay(issued.currency)}`;
    }
    if ('mpt_issuance_id' in amount) {
      const mpt = amount as { mpt_issuance_id: string; value: string };
      return `${formatAmount(mpt.value, 8)} of ${shortenAddress(mpt.mpt_issuance_id, 8, 6)}`;
    }
  }
  return 'Unknown amount';
}

function humanizeType(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function highestRisk(findings: readonly RiskFinding[]): RiskLevel | null {
  if (findings.some((finding) => finding.level === 'danger')) return 'danger';
  if (findings.some((finding) => finding.level === 'caution')) return 'caution';
  return findings.length > 0 ? 'info' : null;
}
