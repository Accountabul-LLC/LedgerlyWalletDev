/**
 * Watch only balance reads.
 *
 * This path is deliberately keyless: it takes public addresses that the signed
 * in profile already saved (wallet names sync, keys never do) and asks a public
 * XRPL server what those accounts hold. Nothing here can sign, and no secret is
 * read, so it is safe to run on a device that has never held the wallet.
 */
import { currencyToDisplay, dropsToXrp } from '../core/xrpl/amount';

/**
 * Public JSON-RPC endpoints. HTTP, not WebSocket, because this is a one shot
 * read. Public clusters rate limit bursts, so we try them in order and fall
 * back rather than surfacing a raw "Failed to fetch" to the user.
 */
const RPC_ENDPOINTS = [
  'https://xrplcluster.com',
  'https://s1.ripple.com:51234',
  'https://s2.ripple.com:51234',
] as const;

export interface WatchToken {
  readonly display: string;
  readonly issuer: string;
  readonly balance: string;
}

export interface WatchAccount {
  readonly address: string;
  readonly name: string;
  readonly funded: boolean;
  readonly xrp: string;
  readonly tokens: readonly WatchToken[];
  readonly provider?: 'joey' | null;
  readonly error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpcOnce(
  endpoint: string,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, params: [params] }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Ledger server returned ${response.status}`);
    const payload = (await response.json()) as { result?: Record<string, unknown> };
    return payload.result ?? {};
  } finally {
    clearTimeout(timer);
  }
}

/** Try each public server, with one short backoff, before giving up. */
async function rpc(
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const endpoint of RPC_ENDPOINTS) {
      try {
        return await rpcOnce(endpoint, method, params);
      } catch (error) {
        lastError = error;
      }
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(
    lastError instanceof Error && lastError.name === 'AbortError'
      ? 'The public ledger servers did not answer in time. Try again in a moment.'
      : 'Could not reach a public ledger server right now. Try again in a moment.',
  );
}

export async function fetchWatchAccount(address: string, name: string): Promise<WatchAccount> {
  try {
    const info = await rpc('account_info', { account: address, ledger_index: 'validated' });
    if (info['error'] === 'actNotFound') {
      return { address, name, funded: false, xrp: '0', tokens: [] };
    }
    if (typeof info['error'] === 'string')
      throw new Error(String(info['error_message'] ?? info['error']));

    const drops = String(
      (info['account_data'] as Record<string, unknown> | undefined)?.['Balance'] ?? '0',
    );
    const lines = await rpc('account_lines', { account: address, ledger_index: 'validated' });
    const rows = Array.isArray(lines['lines']) ? (lines['lines'] as Record<string, unknown>[]) : [];
    const tokens: WatchToken[] = rows
      .filter((row) => Number(row['balance']) > 0)
      .map((row) => ({
        display: currencyToDisplay(String(row['currency'] ?? '')),
        issuer: String(row['account'] ?? ''),
        balance: String(row['balance'] ?? '0'),
      }));

    return { address, name, funded: true, xrp: dropsToXrp(drops), tokens };
  } catch (error) {
    return {
      address,
      name,
      funded: false,
      xrp: '0',
      tokens: [],
      error: error instanceof Error ? error.message : 'Could not reach the ledger.',
    };
  }
}

export async function fetchWatchAccounts(
  entries: readonly { address: string; name: string }[],
): Promise<WatchAccount[]> {
  const results: WatchAccount[] = [];
  // Sequential on purpose: public clusters drop parallel bursts from one origin.
  for (const entry of entries) {
    results.push(await fetchWatchAccount(entry.address, entry.name));
  }
  return results;
}

export function sumXrp(accounts: readonly WatchAccount[]): string {
  const total = accounts.reduce((acc, account) => acc + Number(account.xrp || '0'), 0);
  return total.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
