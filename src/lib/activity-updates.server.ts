import { ACTIVITY_CHANNEL, ACTIVITY_UPDATED } from './activity-updates';

/** Notify viewers only after an event has been committed successfully. */
export async function notifyActivityUpdated(): Promise<void> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const channel = supabaseAdmin.channel(ACTIVITY_CHANNEL);
  try {
    const result = await channel.send({
      type: 'broadcast',
      event: ACTIVITY_UPDATED,
      payload: {},
    });
    if (result !== 'ok') console.warn('Activity update notification unavailable.');
  } catch {
    // A notification failure must not turn a committed wallet event into a failure.
    console.warn('Activity update notification unavailable.');
  } finally {
    try {
      await supabaseAdmin.removeChannel(channel);
    } catch {
      console.warn('Activity update channel cleanup unavailable.');
    }
  }
}
