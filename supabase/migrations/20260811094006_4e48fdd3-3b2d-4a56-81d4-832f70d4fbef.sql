REVOKE ALL ON FUNCTION public.platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_stats() TO anon, authenticated, service_role;