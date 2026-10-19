/**
 * Records a signed Mainnet payment or a wallet counter event. The delivered
 * XRP value is worked out here, from a validated ledger payment, not from
 * figures the caller sends.
 */
import {
  signedPaymentInput,
  walletEventInput,
  type SignedPaymentInput,
} from '@/lib/activity-input';
import { walletFingerprintMaterial } from '@/lib/activity-report';
import { isLedgerPaymentHash, parseValidatedPayment } from '@/lib/ledger-payment';

const RPC: Record<SignedPaymentInput['network'], readonly string[]> = {
  mainnet: ['https://xrplcluster.com', 'https://s1.ripple.com:51234'],
};

/** How many wallet creations one browser or phone may ever contribute. */
const MAX_CREATED_PER_SIGNER = 25;

export class ActivityReportError extends Error {
  readonly status: 400 | 503;

  constructor(message: string, status: 400 | 503) {
    super(message);
    this.status = status;
  }
}

async function fetchValidatedPayment(
  network: keyof typeof RPC,
  txHash: string,
): Promise<ReturnType<typeof parseValidatedPayment>> {
  if (!isLedgerPaymentHash(txHash)) return null;
  for (const endpoint of RPC[network]) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          method: 'tx',
          params: [{ transaction: txHash, binary: false }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as { result?: Record<string, unknown> };
      if (!payload.result) continue;
      const parsed = parseValidatedPayment(payload.result);
      if (parsed && parsed.hash === txHash.toUpperCase()) return parsed;
    } catch {
      /* try the next public server */
    }
  }
  return null;
}

async function accountIsFunded(network: keyof typeof RPC, address: string): Promise<boolean> {
  for (const endpoint of RPC[network]) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          method: 'account_info',
          params: [{ account: address, ledger_index: 'validated' }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        result?: { validated?: boolean; account_data?: { Balance?: string } };
      };
      const balance = Number(payload.result?.account_data?.Balance ?? '0');
      if (payload.result?.validated === true && balance > 0) return true;
    } catch {
      /* try the next public server */
    }
  }
  return false;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function recordSignedPaymentActivity(data: SignedPaymentInput): Promise<{ ok: true }> {
  const payment = await fetchValidatedPayment(data.network, data.txHash);
  if (!payment) {
    throw new ActivityReportError('That payment is not a validated ledger payment.', 400);
  }

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('platform_events').insert({
    kind: 'tx_signed',
    network: data.network,
    signer_key: data.signerKey,
    // Native XRP only. Issued currencies cannot be valued by their ticker.
    xrp_value: payment.currency === 'XRP' ? payment.amount : 0,
    usd_value: 0,
    tx_hash: payment.hash,
  });
  if (error) {
    if (error.code === '23505') return { ok: true };
    throw new ActivityReportError('Could not record the event.', 503);
  }
  const { notifyActivityUpdated } = await import('./activity-updates.server');
  await notifyActivityUpdated();
  return { ok: true };
}

export async function recordWalletActivity(data: {
  kind: 'wallet_created' | 'wallet_activated';
  network: 'mainnet';
  signerKey: string;
  address?: string;
  fingerprint: string;
}): Promise<{ ok: true }> {
  if (data.kind === 'wallet_activated') {
    if (!data.address) {
      throw new ActivityReportError('An activation needs the account it activated.', 400);
    }
    const expected = await sha256Hex(
      walletFingerprintMaterial(data.kind, data.network, data.address),
    );
    if (data.fingerprint !== expected) {
      throw new ActivityReportError('Invalid wallet fingerprint.', 400);
    }
    const funded = await accountIsFunded(data.network, data.address);
    if (!funded) throw new ActivityReportError('That account is not funded on the ledger.', 400);
  }

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  if (data.kind === 'wallet_created') {
    const { count, error } = await supabaseAdmin
      .from('platform_events')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'wallet_created')
      .eq('signer_key', data.signerKey);
    if (error || count === null) {
      throw new ActivityReportError('Could not check the reporting limit.', 503);
    }
    if (count >= MAX_CREATED_PER_SIGNER) return { ok: true };
  }

  const { error } = await supabaseAdmin.from('platform_events').insert({
    kind: data.kind,
    network: data.network,
    signer_key: data.signerKey,
    usd_value: 0,
    dedupe_key: `${data.kind}:${data.network}:${data.fingerprint}`,
  });
  if (error && error.code !== '23505') {
    throw new ActivityReportError('Could not record the event.', 503);
  }
  if (!error) {
    const { notifyActivityUpdated } = await import('./activity-updates.server');
    await notifyActivityUpdated();
  }
  return { ok: true };
}

/** Website server functions and the phone both arrive here. */
export async function recordPublicActivity(body: unknown): Promise<{ ok: true }> {
  const wallet = walletEventInput.safeParse(body);
  if (wallet.success) return recordWalletActivity(wallet.data);
  const payment = signedPaymentInput.safeParse(body);
  if (payment.success) return recordSignedPaymentActivity(payment.data);
  throw new ActivityReportError('Invalid activity report.', 400);
}
