/**
 * Addresses the official XRP Ledger test faucets pay out from. They are run by
 * the ledger's own test infrastructure, not by Ledgerly, so activity coming
 * from them can be shown as a known, verified source of practice funds.
 */
const FAUCET_ADDRESSES: Record<string, readonly string[]> = {
  testnet: ['rJjHYTCPpNA3qAM8ZpCDtip3a8xg7B8PFo'],
  devnet: ['rht5xsioM3iix1hx4i2zJX2WJ1JDTwLGJe'],
};

export function isFaucetAddress(networkId: string, address: string | null | undefined): boolean {
  if (!address) return false;
  return (FAUCET_ADDRESSES[networkId] ?? []).includes(address);
}
