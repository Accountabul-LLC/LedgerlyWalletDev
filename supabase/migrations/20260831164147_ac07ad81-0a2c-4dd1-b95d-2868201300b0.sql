DROP POLICY IF EXISTS "Daily code reports are public to read" ON public.security_reports;

REVOKE ALL ON public.security_reports FROM anon, authenticated;
GRANT ALL ON public.security_reports TO service_role;

CREATE POLICY "Code reports are backend only"
  ON public.security_reports
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);