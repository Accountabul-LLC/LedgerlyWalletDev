/**
 * Activity reports carry public metadata, never wallet secrets. Public hashes
 * and fingerprints can be correlated with the ledger. The random browser key
 * limits creation reports; it is not a count of people.
 *
 * Nothing here writes to the database. The browser has no permission to touch
 * the counters table; every event goes through a server function that checks it
 * first, and an activation or a payment is proved against the XRP Ledger.
 */
import { recordSignedPaymentValue, recordWalletEvent } from '@/lib/metrics.functions';
import { walletFingerprintMaterial } from '@/lib/activity-report';
import { platformStatsSchema, type ActivityNetwork } from '@/lib/platform-stats';
import { ACTIVITY_CHANNEL, ACTIVITY_UPDATED } from '@/lib/activity-updates';
import { supabase } from '@/integrations/supabase/client';
export type { PlatformStats } from '@/lib/platform-stats';

const SIGNER_KEY_STORAGE = 'ledgerly.signer-key';
const ACTIVATED_STORAGE = 'ledgerly.activated-reported-v2';
const pendingActivations = new Set<string>();

function signerKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(SIGNER_KEY_STORAGE);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(SIGNER_KEY_STORAGE, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/** A stable, one way fingerprint so the same wallet is only ever counted once. */
async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** The payload is explicitly limited to public metadata, never wallet secrets. */
async function reportWalletEvent(
  kind: 'wallet_created' | 'wallet_activated',
  network: ActivityNetwork,
  address: string,
): Promise<void> {
  const key = signerKey();
  if (!key) throw new Error('Activity storage unavailable.');
  await recordWalletEvent({
    data: {
      kind,
      network,
      signerKey: key,
      fingerprint: await fingerprint(walletFingerprintMaterial(kind, network, address)),
      ...(kind === 'wallet_activated' ? { address } : {}),
    },
  });
}

/** A failed activity report must never interrupt a wallet action. */
export function recordPlatformEvent(
  kind: 'wallet_created' | 'wallet_activated',
  network: string,
  address: string,
): void {
  if (typeof window === 'undefined' || !address) return;
  if (network !== 'mainnet') return;
  void reportWalletEvent(kind, network, address).catch(() => undefined);
}

/** Remember an activation only after the server accepts it, and separately per network. */
export function recordWalletActivated(network: string, addresses: readonly string[]): void {
  if (typeof window === 'undefined') return;
  if (network !== 'mainnet') return;
  for (const address of addresses) {
    const key = `${network}:${address}`;
    if (!address || pendingActivations.has(key)) continue;
    let reported: string[] = [];
    try {
      const raw: unknown = JSON.parse(window.localStorage.getItem(ACTIVATED_STORAGE) ?? '[]');
      if (Array.isArray(raw))
        reported = raw.filter((entry): entry is string => typeof entry === 'string');
    } catch {
      /* retry reporting when storage is available */
    }
    if (reported.includes(key)) continue;
    pendingActivations.add(key);
    void reportWalletEvent('wallet_activated', network, address)
      .then(() => {
        const raw: unknown = JSON.parse(window.localStorage.getItem(ACTIVATED_STORAGE) ?? '[]');
        const current = Array.isArray(raw)
          ? raw.filter((entry): entry is string => typeof entry === 'string')
          : [];
        window.localStorage.setItem(
          ACTIVATED_STORAGE,
          JSON.stringify([...new Set([...current, key])]),
        );
      })
      .catch(() => undefined)
      .finally(() => pendingActivations.delete(key));
  }
}

/**
 * Records a signed payment after it lands on the ledger. The browser only
 * sends the transaction hash; the server looks the payment up and prices it.
 * A payment the ledger cannot confirm is simply not counted.
 *
 * A payment handed off to an outside wallet is only known to be accepted by a
 * node, not yet validated, so the attempt is repeated for a short while until
 * the ledger has caught up. The hash can only ever count once, so a repeat is
 * harmless.
 */
const CONFIRM_RETRY_DELAYS_MS = [0, 4000, 5000, 8000, 15000, 30000];

export function recordSignedPayment(network: string, txHash?: string): void {
  if (typeof window === 'undefined' || network !== 'mainnet') return;
  const key = signerKey();
  if (!key || !txHash || !/^[0-9A-Fa-f]{64}$/.test(txHash)) return;

  void (async () => {
    for (const delay of CONFIRM_RETRY_DELAYS_MS) {
      if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
      try {
        await recordSignedPaymentValue({ data: { network, signerKey: key, txHash } });
        return;
      } catch {
        /* the ledger has not validated it yet; try again shortly */
      }
    }
  })();
}

export async function fetchPlatformStats(signal?: AbortSignal) {
  const response = await fetch('/api/public/activity', {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Activity totals unavailable.');
  const stats = platformStatsSchema.parse(await response.json());
  return stats;
}

/** Reconcile on subscription/reconnection as well as each recorded event. */
export function subscribePlatformStats(onUpdate: () => void): () => void {
  const channel = supabase
    .channel(ACTIVITY_CHANNEL)
    .on('broadcast', { event: ACTIVITY_UPDATED }, onUpdate)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onUpdate();
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
