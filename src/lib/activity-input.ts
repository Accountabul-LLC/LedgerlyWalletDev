import { z } from 'zod';
import { CLASSIC_ADDRESS_PATTERN } from '@/lib/ingest-guards';

const productionNetwork = z.literal('mainnet');

/** Public metadata accepted when a validated production payment is recorded. */
export const signedPaymentInput = z
  .object({
    network: productionNetwork,
    signerKey: z.string().uuid(),
    txHash: z.string().regex(/^[0-9A-Fa-f]{64}$/),
  })
  .strict();

/** Public metadata accepted by the production wallet counters. */
export const walletEventInput = z
  .object({
    kind: z.enum(['wallet_created', 'wallet_activated']),
    network: productionNetwork,
    signerKey: z.string().uuid(),
    address: z.string().regex(CLASSIC_ADDRESS_PATTERN).optional(),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type SignedPaymentInput = z.infer<typeof signedPaymentInput>;
