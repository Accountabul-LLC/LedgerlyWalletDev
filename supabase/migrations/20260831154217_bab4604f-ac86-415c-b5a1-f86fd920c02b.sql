-- cron_tokens holds the shared secret the daily report job proves itself with.
-- It already had no grants, but an explicit deny policy states the intent in
-- the schema itself rather than relying on the absence of a rule.
DROP POLICY IF EXISTS "Scheduled job tokens are backend only" ON public.cron_tokens;
CREATE POLICY "Scheduled job tokens are backend only"
  ON public.cron_tokens
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);