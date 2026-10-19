CREATE TABLE public.platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('wallet_created','tx_signed')),
  network text NOT NULL CHECK (char_length(network) <= 32),
  signer_key text NOT NULL CHECK (char_length(signer_key) BETWEEN 8 AND 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.platform_events TO anon, authenticated;
GRANT ALL ON public.platform_events TO service_role;

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record an anonymous platform event"
ON public.platform_events FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE INDEX platform_events_kind_idx ON public.platform_events (kind);

CREATE OR REPLACE FUNCTION public.platform_stats()
RETURNS TABLE (wallets_created bigint, transactions_signed bigint, signers bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE kind = 'wallet_created'),
    count(*) FILTER (WHERE kind = 'tx_signed'),
    count(DISTINCT signer_key) FILTER (WHERE kind = 'tx_signed')
  FROM public.platform_events
$$;

GRANT EXECUTE ON FUNCTION public.platform_stats() TO anon, authenticated;