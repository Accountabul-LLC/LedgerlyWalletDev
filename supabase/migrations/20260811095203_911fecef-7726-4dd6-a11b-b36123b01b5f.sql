-- Explicit deny: nobody reading through the API can see individual event rows.
DROP POLICY IF EXISTS "No direct reads of platform events" ON public.platform_events;
CREATE POLICY "No direct reads of platform events"
  ON public.platform_events FOR SELECT
  TO anon, authenticated
  USING (false);

-- Totals are served through the app's own server, not called from the browser.
REVOKE EXECUTE ON FUNCTION public.platform_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_stats() TO service_role;

-- Trigger-only functions stay unreachable through the API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;