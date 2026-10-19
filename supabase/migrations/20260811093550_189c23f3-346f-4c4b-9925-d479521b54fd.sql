ALTER TABLE public.platform_events
  ADD COLUMN IF NOT EXISTS usd_value numeric(20,2) NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS "Anyone can record an anonymous platform event" ON public.platform_events;

CREATE POLICY "Anyone can record a zero value platform event"
  ON public.platform_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (usd_value = 0);

DROP FUNCTION IF EXISTS public.platform_stats();

CREATE FUNCTION public.platform_stats()
RETURNS TABLE(wallets_created bigint, transactions_signed bigint, signers bigint, value_sent_usd numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    count(*) FILTER (WHERE kind = 'wallet_created'),
    count(*) FILTER (WHERE kind = 'tx_signed'),
    count(DISTINCT signer_key) FILTER (WHERE kind = 'tx_signed'),
    COALESCE(sum(usd_value) FILTER (WHERE kind = 'tx_signed'), 0)::numeric
  FROM public.platform_events
$function$;

REVOKE EXECUTE ON FUNCTION public.platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_stats() TO anon, authenticated;