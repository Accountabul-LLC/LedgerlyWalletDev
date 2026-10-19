-- Least privilege: strip TRUNCATE/REFERENCES/TRIGGER/MAINTAIN and any
-- write privilege that no policy backs. RLS does not mediate TRUNCATE, so a
-- lingering TRUNCATE grant is a real hole even with policies in place.

REVOKE ALL ON public.contacts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

REVOKE ALL ON public.wallet_labels FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_labels TO authenticated;
GRANT ALL ON public.wallet_labels TO service_role;

-- Append-only metrics: insert is allowed, reads are denied by policy and by
-- the absence of a SELECT grant.
REVOKE ALL ON public.platform_events FROM anon, authenticated;
GRANT INSERT ON public.platform_events TO anon, authenticated;
GRANT ALL ON public.platform_events TO service_role;

-- Public reference data: read only.
REVOKE ALL ON public.xrpl_tokens FROM anon, authenticated;
GRANT SELECT ON public.xrpl_tokens TO anon, authenticated;
GRANT ALL ON public.xrpl_tokens TO service_role;

-- Published daily code reports: read only.
REVOKE ALL ON public.security_reports FROM anon, authenticated;
GRANT SELECT ON public.security_reports TO anon, authenticated;
GRANT ALL ON public.security_reports TO service_role;

-- Scheduled job tokens: backend only, no policy, no grant.
REVOKE ALL ON public.cron_tokens FROM anon, authenticated;
GRANT ALL ON public.cron_tokens TO service_role;