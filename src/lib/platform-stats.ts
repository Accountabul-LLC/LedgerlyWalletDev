import { z } from 'zod';

export const activityNetwork = z.literal('mainnet');
export type ActivityNetwork = z.infer<typeof activityNetwork>;

export const platformStatsSchema = z.object({
  network: activityNetwork,
  walletsCreated: z.number().int().nonnegative().safe(),
  walletsActivated: z.number().int().nonnegative().safe(),
  transactionsSigned: z.number().int().nonnegative().safe(),
  valueSentXrp: z.number().finite().nonnegative().nullable(),
  updatedAt: z.string().datetime(),
});
export type PlatformStats = z.infer<typeof platformStatsSchema>;

/** Missing or malformed database results are unavailable, never invented zeroes. */
export function parsePlatformTotals(row: unknown, network: ActivityNetwork): PlatformStats {
  const count = z
    .union([z.number(), z.string().min(1)])
    .pipe(z.coerce.number().int().nonnegative().safe());
  const totals = z
    .object({
      wallets_created: count,
      wallets_activated: count,
      transactions_signed: count,
      value_sent_xrp: z.union([z.number(), z.string().min(1)]).nullable(),
    })
    .strict()
    .parse(row);
  return platformStatsSchema.parse({
    network,
    walletsCreated: totals.wallets_created,
    walletsActivated: totals.wallets_activated,
    transactionsSigned: totals.transactions_signed,
    valueSentXrp: totals.value_sent_xrp === null ? null : Number(totals.value_sent_xrp),
    updatedAt: new Date().toISOString(),
  });
}
