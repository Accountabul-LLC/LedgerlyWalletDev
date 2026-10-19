DROP FUNCTION IF EXISTS public.platform_stats();

CREATE OR REPLACE FUNCTION public.platform_stats()
 RETURNS TABLE(wallets_created bigint, wallets_activated bigint, transactions_signed bigint, signers bigint, value_sent_usd numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    count(*) FILTER (WHERE kind = 'wallet_created'),
    count(*) FILTER (WHERE kind = 'wallet_activated'),
    count(*) FILTER (WHERE kind = 'tx_signed'),
    count(DISTINCT signer_key) FILTER (WHERE kind = 'tx_signed'),
    COALESCE(sum(usd_value) FILTER (WHERE kind = 'tx_signed'), 0)::numeric
  FROM public.platform_events
$function$;

REVOKE EXECUTE ON FUNCTION public.platform_stats() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_stats() TO service_role;