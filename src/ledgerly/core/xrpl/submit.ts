import type { Client, SubmittableTransaction, Transaction } from 'xrpl';

export interface SubmissionResult {
  readonly hash: string;
  readonly engineResult: string;
  readonly validated: boolean;
  readonly succeeded: boolean;
  readonly message: string;
  readonly ledgerIndex?: number;
}

/**
 * A ceiling on what the wallet will pay in fees without the user having typed
 * the number themselves. `autofill` scales the fee with network load, and an
 * endpoint that reports a fabricated load figure could otherwise drain an
 * account through fees alone. Two XRP is far above any legitimate fee.
 */
export const MAX_AUTOFILL_FEE_DROPS = 2_000_000n;

/** Roughly one minute of ledgers; long enough to confirm, short enough to bound the risk. */
const LEDGER_VALIDITY_WINDOW = 20;

/**
 * Fills in fee, sequence and expiry, then hands back the exact object that will
 * be signed. Nothing may modify the transaction between this call and signing:
 * the approval screen describes this object, so a later edit would mean the
 * user approved something other than what they signed.
 */
export async function prepareTransaction(
  client: Client,
  transaction: Transaction,
): Promise<Transaction> {
  const prepared = await client.autofill(transaction as SubmittableTransaction);

  if (typeof prepared.Fee === 'string' && BigInt(prepared.Fee) > MAX_AUTOFILL_FEE_DROPS) {
    throw new Error(
      'The network is quoting an unusually high fee right now. Ledgerly stopped rather than paying it.',
    );
  }

  if (prepared.LastLedgerSequence === undefined) {
    const ledger = await client.getLedgerIndex();
    prepared.LastLedgerSequence = ledger + LEDGER_VALIDITY_WINDOW;
  }

  return prepared as Transaction;
}

export async function submitSigned(client: Client, txBlob: string): Promise<SubmissionResult> {
  const response = await client.submitAndWait(txBlob);
  const meta = response.result.meta;
  const engineResult =
    typeof meta === 'object' && meta !== null && 'TransactionResult' in meta
      ? meta.TransactionResult
      : 'unknown';

  return {
    hash: response.result.hash,
    engineResult,
    validated: response.result.validated === true,
    succeeded: engineResult === 'tesSUCCESS',
    message: explainEngineResult(engineResult),
    ...(typeof response.result.ledger_index === 'number'
      ? { ledgerIndex: response.result.ledger_index }
      : {}),
  };
}

const RESULT_MESSAGES: Record<string, string> = {
  tesSUCCESS: 'Transaction confirmed.',
  tecUNFUNDED_PAYMENT: 'Not enough XRP to cover the amount plus the account reserve.',
  tecNO_DST: 'The destination account does not exist and the amount is below the base reserve needed to create it.',
  tecNO_DST_INSUF_XRP: 'The destination is a new account and the amount is below the base reserve required to activate it.',
  tecDST_TAG_NEEDED: 'The destination requires a destination tag.',
  tecPATH_DRY: 'No path could deliver this amount. The issuer may lack liquidity.',
  tecNO_LINE_INSUF_RESERVE: 'Not enough XRP in reserve to create the required trust line.',
  tecINSUFFICIENT_RESERVE: 'Not enough XRP to meet the reserve this object requires.',
  tecNO_PERMISSION: 'The destination does not accept payments from this account.',
  tecFROZEN: 'That trust line is frozen by the issuer.',
  tecNO_AUTH: 'The issuer has not authorised this account to hold the token.',
  tefPAST_SEQ: 'This sequence number has already been used. Refresh and try again.',
  tefMAX_LEDGER: 'The transaction expired before it was validated.',
  telINSUF_FEE_P: 'The fee was too low for current network load.',
  temREDUNDANT: 'The source and destination are the same.',
  temBAD_AMOUNT: 'The amount is not valid.',
  terQUEUED: 'Queued for a future ledger.',
};

/**
 * `tec` results are the trap: the transaction is written to the ledger and the
 * fee is charged, but the intended effect did not happen. Reporting those as
 * success is how a wallet tells someone a payment went through when it did not.
 */
export function explainEngineResult(code: string): string {
  const known = RESULT_MESSAGES[code];
  if (known) return known;
  if (code.startsWith('tec')) return `The transaction was recorded but did not take effect (${code}).`;
  if (code.startsWith('tem')) return `The transaction was malformed (${code}).`;
  if (code.startsWith('ter')) return `The transaction could not be applied yet (${code}).`;
  if (code.startsWith('tef')) return `The transaction can never be applied (${code}).`;
  if (code.startsWith('tel')) return `The server declined the transaction locally (${code}).`;
  return `Unrecognised result: ${code}`;
}
