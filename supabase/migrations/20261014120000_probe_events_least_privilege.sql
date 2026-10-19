-- Databases that already applied the probe_events migration still hold the
-- default table grants. Repeat the lockdown so anon and authenticated can
-- insert a probe and cannot read, change, or empty the table.
REVOKE ALL ON public.probe_events FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.probe_events TO anon;
GRANT INSERT ON public.probe_events TO authenticated;
GRANT ALL ON public.probe_events TO service_role;
