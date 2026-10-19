/**
 * The phone records the same public Mainnet counters as the website. Reports
 * go to the production site, which checks them before anything is stored.
 * A failed report never blocks creating, opening, or sending.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  PRODUCTION_ACTIVITY_URL,
  isProductionActivityNetwork,
  signedPaymentBody,
  walletActivityBody,
  walletFingerprintMaterial,
} from '../../src/lib/activity-report';

const SIGNER_KEY_STORAGE = 'ledgerly.signer-key';
const ACTIVATED_STORAGE = 'ledgerly.activated-reported-v2';
const pendingActivations = new Set<string>();

async function signerKey(): Promise<string | null> {
  try {
    const existing = await AsyncStorage.getItem(SIGNER_KEY_STORAGE);
    if (existing) return existing;
    const fresh = Crypto.randomUUID();
    await AsyncStorage.setItem(SIGNER_KEY_STORAGE, fresh);
    return fresh;
  } catch {
    return null;
  }
}

async function fingerprint(value: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  return digest.toLowerCase();
}

/** Preview/test builds never report to the production site. */
const ACTIVITY_REPORTING_ENABLED = process.env.EXPO_PUBLIC_LEDGERLY_BACKEND?.trim() !== 'test';

async function postReport(body: unknown): Promise<void> {
  if (!ACTIVITY_REPORTING_ENABLED) return;
  const response = await fetch(PRODUCTION_ACTIVITY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Could not record the event.');
}

async function reportWalletEvent(
  kind: 'wallet_created' | 'wallet_activated',
  address: string,
): Promise<void> {
  const key = await signerKey();
  if (!key) throw new Error('Activity storage unavailable.');
  await postReport(
    walletActivityBody({
      kind,
      signerKey: key,
      fingerprint: await fingerprint(walletFingerprintMaterial(kind, 'mainnet', address)),
      address,
    }),
  );
}

/** A failed activity report must never interrupt a wallet action. */
export function recordPlatformEvent(
  kind: 'wallet_created' | 'wallet_activated',
  network: string,
  address: string,
): void {
  if (!isProductionActivityNetwork(network) || !address) return;
  void reportWalletEvent(kind, address).catch(() => undefined);
}

/** Remember an activation only after the server accepts it. */
export function recordWalletActivated(network: string, addresses: readonly string[]): void {
  if (!isProductionActivityNetwork(network)) return;
  for (const address of addresses) {
    const key = `${network}:${address}`;
    if (!address || pendingActivations.has(key)) continue;
    pendingActivations.add(key);
    void (async () => {
      let reported: string[] = [];
      try {
        const raw: unknown = JSON.parse((await AsyncStorage.getItem(ACTIVATED_STORAGE)) ?? '[]');
        if (Array.isArray(raw)) {
          reported = raw.filter((entry): entry is string => typeof entry === 'string');
        }
      } catch {
        /* retry reporting when storage is available */
      }
      if (reported.includes(key)) return;
      await reportWalletEvent('wallet_activated', address);
      const raw: unknown = JSON.parse((await AsyncStorage.getItem(ACTIVATED_STORAGE)) ?? '[]');
      const current = Array.isArray(raw)
        ? raw.filter((entry): entry is string => typeof entry === 'string')
        : [];
      await AsyncStorage.setItem(
        ACTIVATED_STORAGE,
        JSON.stringify([...new Set([...current, key])]),
      );
    })()
      .catch(() => undefined)
      .finally(() => pendingActivations.delete(key));
  }
}

/**
 * Records a signed payment after it lands on the ledger. The phone only sends
 * the transaction hash. The same hash can only ever count once.
 */
const CONFIRM_RETRY_DELAYS_MS = [0, 4000, 5000, 8000, 15000, 30000];

export function recordSignedPayment(network: string, txHash?: string): void {
  if (!isProductionActivityNetwork(network) || !txHash || !/^[0-9A-Fa-f]{64}$/.test(txHash)) return;
  void (async () => {
    const key = await signerKey();
    if (!key) return;
    for (const delay of CONFIRM_RETRY_DELAYS_MS) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await postReport(signedPaymentBody({ signerKey: key, txHash }));
        return;
      } catch {
        /* the ledger has not validated it yet; try again shortly */
      }
    }
  })();
}
