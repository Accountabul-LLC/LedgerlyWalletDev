-- Store only ledger-confirmed delivered XRP. NULL means an older event whose
-- delivered amount was never recorded; do not invent a zero for that event.
ALTER TABLE public.platform_events
  ADD COLUMN IF NOT EXISTS xrp_value numeric CHECK (xrp_value >= 0);

CREATE INDEX IF NOT EXISTS platform_events_network_kind_idx
  ON public.platform_events (network, kind);

CREATE OR REPLACE FUNCTION public.platform_stats_by_network(activity_network text)
RETURNS TABLE (
  wallets_created bigint,
  wallets_activated bigint,
  transactions_signed bigint,
  value_sent_xrp numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    count(*) FILTER (WHERE kind = 'wallet_created'),
    count(*) FILTER (WHERE kind = 'wallet_activated'),
    count(*) FILTER (WHERE kind = 'tx_signed' AND tx_hash IS NOT NULL),
    CASE WHEN count(*) FILTER (WHERE kind = 'tx_signed' AND tx_hash IS NOT NULL AND xrp_value IS NULL) > 0
      THEN NULL
      ELSE coalesce(sum(xrp_value) FILTER (WHERE kind = 'tx_signed' AND tx_hash IS NOT NULL), 0)
    END
  FROM public.platform_events
  WHERE network = activity_network AND activity_network IN ('mainnet', 'testnet', 'devnet')
$$;

REVOKE ALL ON FUNCTION public.platform_stats_by_network(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_stats_by_network(text) TO service_role;
