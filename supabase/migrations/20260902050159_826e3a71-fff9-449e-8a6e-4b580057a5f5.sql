CREATE TABLE public.joey_auth_nonces (
  nonce_hash TEXT PRIMARY KEY,
  requested_domain TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.joey_auth_nonces TO service_role;
ALTER TABLE public.joey_auth_nonces ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.set_joey_auth_nonces_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER joey_auth_nonces_updated_at
BEFORE UPDATE ON public.joey_auth_nonces
FOR EACH ROW EXECUTE FUNCTION public.set_joey_auth_nonces_updated_at();
REVOKE ALL ON public.joey_auth_nonces FROM anon, authenticated;
CREATE INDEX joey_auth_nonces_expires_at_idx ON public.joey_auth_nonces (expires_at);