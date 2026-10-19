/** The metrics server functions are website-only; the popup records nothing. */
export const recordSignedPaymentValue = async (): Promise<{ ok: true }> => {
  throw new Error('Platform metrics are recorded by the Ledgerly web app.');
};

export const recordWalletEvent = async (): Promise<{ ok: true }> => {
  throw new Error('Platform metrics are recorded by the Ledgerly web app.');
};

/** The popup does not show platform totals. */
export const fetchPlatformTotals = async () => ({
  walletsCreated: 0,
  walletsActivated: 0,
  transactionsSigned: 0,
  signers: 0,
  valueSentUsd: 0,
});
