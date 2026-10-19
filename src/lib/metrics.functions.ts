/**
 * Public counters for the landing page. The browser and the phone send only
 * public metadata. Payment amounts are read from the ledger in
 * activity-record.server.ts, and event rows stay behind the service role.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { signedPaymentInput, walletEventInput } from '@/lib/activity-input';
import { activityWritesAllowed } from '@/lib/activity-report';

export const recordSignedPaymentValue = createServerFn({ method: 'POST' })
  .validator((data: unknown) => signedPaymentInput.parse(data))
  .handler(async ({ data }) => {
    if (!activityWritesAllowed(process.env)) return { ok: true as const };
    const { recordSignedPaymentActivity } = await import('./activity-record.server');
    return recordSignedPaymentActivity(data);
  });

/**
 * The only way a wallet counter can move from the website. The browser has no
 * write access to the counters table, so every event passes through here first.
 */
export const recordWalletEvent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => walletEventInput.parse(data))
  .handler(async ({ data }) => {
    if (!activityWritesAllowed(process.env)) return { ok: true as const };
    const { recordWalletActivity } = await import('./activity-record.server');
    return recordWalletActivity(data);
  });

/**
 * Public totals for the landing page. Read on the server so the browser never
 * needs permission to touch the events table or its aggregate function.
 */
export const fetchPlatformTotals = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.literal('mainnet').parse(data))
  .handler(async ({ data }) => {
    const { getPlatformTotals } = await import('./platform-stats.server');
    return getPlatformTotals(data);
  });
