REVOKE ALL ON public.contacts FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.wallet_labels FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.xrpl_tokens FROM anon, authenticated;
GRANT SELECT ON public.xrpl_tokens TO anon, authenticated;

REVOKE ALL ON public.platform_events FROM anon, authenticated;
GRANT INSERT ON public.platform_events TO anon, authenticated;