CREATE TABLE public.cron_tokens (
  name TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON public.cron_tokens FROM anon, authenticated;
GRANT ALL ON public.cron_tokens TO service_role;

ALTER TABLE public.cron_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cron_tokens (name, token)
VALUES ('daily-audit', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;