ALTER TABLE public.platform_events
  ADD COLUMN IF NOT EXISTS tx_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS platform_events_tx_hash_key
  ON public.platform_events (tx_hash)
  WHERE tx_hash IS NOT NULL;

DROP POLICY IF EXISTS "Anyone can record a zero value platform event" ON public.platform_events;

-- 20260904185300 already creates this policy. A second CREATE fails when that
-- version has been applied. This does not change the policy definition.
DROP POLICY IF EXISTS "Anyone can record a zero-value event without a payment hash" ON public.platform_events;

CREATE POLICY "Anyone can record a zero-value event without a payment hash"
  ON public.platform_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (usd_value = 0 AND tx_hash IS NULL);