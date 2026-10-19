/**
 * Wallets that live outside Ledgerly.
 *
 * The contract here is deliberately narrow. An outside wallet gives us public
 * addresses and, when the user approves it there, a signature. It never hands
 * over a key, a seed or a phrase, and nothing in this interface can ask for
 * one. Ledgerly's own keyring refuses these accounts by id, so the only way a
 * connected wallet can move value is through its own approval screen.
 *
 * Joey is the first provider. The shape is kept general so GemWallet,
 * Crossmark and Xaman can slot in later without touching the call sites.
 */
import type { ExternalProviderId } from '@ledgerly/core/shared';

export interface ExternalSignIn {
  /** Address that signed the challenge. */
  readonly address: string;
  readonly publicKey: string;
  /** Hex signature over `message`. */
  readonly signature: string;
  /** The exact string that was signed, rebuilt server side to verify it. */
  readonly message: string;
}

export interface ExternalSubmission {
  readonly hash: string;
  readonly engineResult: string;
  readonly succeeded: boolean;
  readonly message: string;
}

export interface ExternalProvider {
  readonly id: ExternalProviderId;
  readonly name: string;
  /** Where to get it, shown when the extension is not on the page. */
  readonly installUrl: string;
  /** Synchronous, never throws: true when the provider is injected. */
  isAvailable(): boolean;
  /** Prompts the user in their wallet and returns the granted addresses. */
  connect(): Promise<readonly string[]>;
  /** Returns already-granted addresses without prompting. */
  reconnect(): Promise<readonly string[]>;
  disconnect(): Promise<void>;
  /** Signs and submits a transaction Ledgerly prepared, approved in their wallet. */
  signAndSubmit(input: {
    address: string;
    networkId: number;
    transaction: unknown;
  }): Promise<ExternalSubmission>;
  /** Signs a sign-in challenge. The signature is verified on our server. */
  signIn(input: { statement: string; nonce: string }): Promise<ExternalSignIn>;
}
