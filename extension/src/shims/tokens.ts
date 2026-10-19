/** The token search server function is website-only; the popup never calls it. */
export interface DirectoryToken {
  currency: string;
  issuer: string;
  name?: string | null;
  domain?: string | null;
  holders?: number | null;
  trustlines?: number | null;
  verified?: boolean | null;
  updatedAt?: string | null;
}

export const searchTokens = async (): Promise<{
  tokens: DirectoryToken[];
  syncedAt: string | null;
}> => {
  throw new Error('The token directory is available in the Ledgerly web app.');
};
