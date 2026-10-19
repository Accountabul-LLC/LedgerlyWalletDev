import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Deletes the Ledgerly profile and everything synced to it.
 *
 * This is an account and privacy action only. It removes the profile login and
 * the non-secret metadata attached to it (wallet names, saved payees). It does
 * not touch any XRPL account: those live on the ledger, keep their balances,
 * and remain controlled by whoever holds the keys, which is only ever the
 * person's own device.
 */
export const deleteProfile = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    // Scoped deletes through the caller's own session, so RLS still applies.
    await context.supabase.from('wallet_labels').delete().eq('user_id', userId);
    await context.supabase.from('contacts').delete().eq('user_id', userId);

    // Removing the login itself is the one step that needs elevated rights,
    // and it happens only after the caller has been authenticated above.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { deleted: true };
  });
