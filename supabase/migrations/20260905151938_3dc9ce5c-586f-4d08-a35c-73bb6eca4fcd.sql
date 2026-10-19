DROP POLICY IF EXISTS "Anyone can record a zero-value event without a payment hash" ON public.platform_events;
DROP POLICY IF EXISTS "Anyone can record a zero value platform event" ON public.platform_events;

REVOKE INSERT, UPDATE, DELETE ON public.platform_events FROM anon, authenticated;
GRANT ALL ON public.platform_events TO service_role;

CREATE POLICY "No browser writes to platform events"
  ON public.platform_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

ALTER TABLE public.platform_events ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS platform_events_dedupe_key_idx
  ON public.platform_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;