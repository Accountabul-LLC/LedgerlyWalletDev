/**
 * Joey, the first outside wallet Ledgerly can connect to.
 *
 * The SDK talks to a page-injected provider, so everything here runs in the
 * browser tab and never in the worker or on the server. Joey keeps the key and
 * shows its own approval screen: this file passes an address in and gets a
 * signature or a submitted hash back, nothing else.
 */
import type { ExternalProvider, ExternalSignIn, ExternalSubmission } from './provider';

const JOEY_INSTALL_URL = 'https://joeywallet.xyz';

type JoeyModule = typeof import('@joeywallet/wallet-sdk');

let modulePromise: Promise<JoeyModule> | null = null;

async function sdk(): Promise<JoeyModule> {
  modulePromise ??= import('@joeywallet/wallet-sdk');
  return modulePromise;
}

/** Turns SDK failures into a sentence a person can act on. */
function explain(error: unknown): Error {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : 'Joey could not complete that.';
  if (code === 4001) return new Error('You declined that request in Joey.');
  if (code === 4900) return new Error('Joey is not available in this browser.');
  if (code === 4901) {
    return new Error('Joey is on a different network. Switch it in Joey, then try again.');
  }
  return new Error(message);
}

async function client() {
  const { getJoey } = await sdk();
  const joey = getJoey();
  if (!joey) {
    throw new Error('Joey is not installed in this browser.');
  }
  return joey;
}

function chainFor(networkId: number): 'xrpl:0' | 'xrpl:1' | 'xrpl:2' | undefined {
  if (networkId === 0) return 'xrpl:0';
  if (networkId === 1) return 'xrpl:1';
  if (networkId === 2) return 'xrpl:2';
  return undefined;
}

export const joeyProvider: ExternalProvider = {
  id: 'joey',
  name: 'Joey',
  installUrl: JOEY_INSTALL_URL,

  isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    const globals = window as unknown as { joey?: unknown; xrpl?: { joey?: unknown } };
    return Boolean(globals.joey ?? globals.xrpl?.joey);
  },

  async connect(): Promise<readonly string[]> {
    try {
      const { waitForJoey } = await sdk();
      const joey = await waitForJoey({ timeoutMs: 3000 });
      const result = await joey.connect({ name: 'Ledgerly' });
      const accounts = result.accounts.map((account) =>
        typeof account === 'string' ? account : account.address,
      );
      if (accounts.length === 0) {
        throw new Error('Joey did not share an address. Approve the request and try again.');
      }
      return accounts;
    } catch (error) {
      throw explain(error);
    }
  },

  async reconnect(): Promise<readonly string[]> {
    try {
      const { getJoey } = await sdk();
      const joey = getJoey();
      if (!joey) return [];
      return await joey.getAccounts();
    } catch {
      return [];
    }
  },

  async disconnect(): Promise<void> {
    try {
      const { getJoey } = await sdk();
      await getJoey()?.disconnect();
    } catch {
      // Losing the grant on Joey's side is best effort; the wallet is removed
      // from this device either way.
    }
  },

  async signAndSubmit(input: {
    address: string;
    networkId: number;
    transaction: unknown;
  }): Promise<ExternalSubmission> {
    try {
      const joey = await client();
      const chain = chainFor(input.networkId);
      const result = await joey.signAndSubmitTransaction({
        tx_json: input.transaction as { TransactionType: string } & Record<string, unknown>,
        account: input.address,
        ...(chain ? { chain } : {}),
        autofill: false,
      });
      const engineResult = result.engine_result ?? 'unknown';
      const succeeded = engineResult === 'tesSUCCESS';
      return {
        hash: result.hash,
        engineResult,
        succeeded,
        message: succeeded
          ? 'Joey signed and submitted the transaction.'
          : (result.engine_result_message ??
            'Joey submitted the transaction but the ledger did not accept it.'),
      };
    } catch (error) {
      throw explain(error);
    }
  },

  async signIn(input: { statement: string; nonce: string }): Promise<ExternalSignIn> {
    try {
      const joey = await client();
      const result = await joey.signIn({
        mode: 'caip122',
        statement: input.statement.slice(0, 512),
        nonce: input.nonce.slice(0, 128),
      });
      return {
        address: result.address,
        publicKey: result.publicKey,
        signature: result.signature,
        message: result.message,
      };
    } catch (error) {
      throw explain(error);
    }
  },
};
