CREATE TABLE public.probe_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  network text NOT NULL,
  signer_key text NOT NULL,
  usd_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- New public tables inherit SELECT, INSERT, UPDATE, DELETE, and TRUNCATE for
-- anon and authenticated. Probe rows are append-only: keep insert, and take
-- the rest away. TRUNCATE is included because row level security does not
-- cover it.
REVOKE ALL ON public.probe_events FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.probe_events TO anon;
GRANT INSERT ON public.probe_events TO authenticated;
GRANT ALL ON public.probe_events TO service_role;

ALTER TABLE public.probe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record a probe attempt"
ON public.probe_events FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "No browser reads of probe attempts"
ON public.probe_events FOR SELECT TO anon, authenticated
USING (false);

CREATE OR REPLACE FUNCTION public.reject_probe_platform_events()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.signer_key, '')) ~ '(probe|test|forge|scan|fake|poc|qa|sample|dummy)' THEN
    RAISE EXCEPTION 'Test and probe events must be recorded in probe_events, not platform_events';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_events_reject_probes
BEFORE INSERT OR UPDATE ON public.platform_events
FOR EACH ROW EXECUTE FUNCTION public.reject_probe_platform_events();