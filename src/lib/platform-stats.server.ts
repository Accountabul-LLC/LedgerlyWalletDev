import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { parsePlatformTotals, type ActivityNetwork } from './platform-stats';

/** Only aggregate totals leave the server; event rows stay behind service-role access. */
export async function getPlatformTotals(network: ActivityNetwork) {
  const { data, error } = await supabaseAdmin.rpc('platform_stats_by_network', {
    activity_network: network,
  });
  if (error || !data || data.length !== 1) throw new Error('Activity totals unavailable.');
  return parsePlatformTotals(data[0], network);
}
