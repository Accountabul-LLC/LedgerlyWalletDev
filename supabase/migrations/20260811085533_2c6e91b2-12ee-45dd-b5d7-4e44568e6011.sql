REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- platform_stats returns only aggregate counts and powers the public landing page.
REVOKE ALL ON FUNCTION public.platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_stats() TO anon, authenticated, service_role;