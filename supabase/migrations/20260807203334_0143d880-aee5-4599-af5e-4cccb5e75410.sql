CREATE TABLE public.xrpl_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL,
  issuer text NOT NULL,
  ticker text NOT NULL,
  display_name text,
  issuer_name text,
  logo_url text,
  holders integer NOT NULL DEFAULT 0,
  trust_score integer,
  source text NOT NULL DEFAULT 'xrpscan',
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (currency, issuer)
);

GRANT SELECT ON public.xrpl_tokens TO anon;
GRANT SELECT ON public.xrpl_tokens TO authenticated;
GRANT ALL ON public.xrpl_tokens TO service_role;

ALTER TABLE public.xrpl_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Token directory is public reference data"
ON public.xrpl_tokens FOR SELECT
TO anon, authenticated
USING (true);

CREATE INDEX xrpl_tokens_holders_idx ON public.xrpl_tokens (holders DESC);
CREATE INDEX xrpl_tokens_ticker_idx ON public.xrpl_tokens (lower(ticker));

CREATE TRIGGER xrpl_tokens_touch
BEFORE UPDATE ON public.xrpl_tokens
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();