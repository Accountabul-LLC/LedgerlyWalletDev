BEGIN;

SELECT plan(8);

SELECT cmp_ok(
  (SELECT count(*)
   FROM pg_class AS c
   JOIN pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'),
  '>',
  0::bigint,
  'migrations create at least one public table'
);

SELECT is(
  (SELECT count(*)
   FROM pg_class AS c
   JOIN pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity),
  0::bigint,
  'every public table has row level security'
);

SELECT CASE
  WHEN to_regclass('public.profiles') IS NULL THEN skip('profiles table is not present', 1)
  ELSE ok(
    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%auth.uid()%'
    ),
    'profiles access is scoped to auth.uid()'
  )
END;

SELECT CASE
  WHEN to_regclass('public.wallet_labels') IS NULL THEN skip('wallet_labels table is not present', 1)
  ELSE ok(
    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'wallet_labels'
        AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%auth.uid()%'
    ),
    'wallet label access is scoped to auth.uid()'
  )
END;

SELECT CASE
  WHEN to_regclass('public.contacts') IS NULL THEN skip('contacts table is not present', 1)
  ELSE ok(
    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'contacts'
        AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%auth.uid()%'
    ),
    'contact access is scoped to auth.uid()'
  )
END;

SELECT CASE
  WHEN to_regclass('public.profiles') IS NULL THEN skip('profiles table is not present', 1)
  ELSE ok(
    NOT has_table_privilege('anon', 'public.profiles', 'SELECT'),
    'anon cannot read profiles'
  )
END;

SELECT CASE
  WHEN to_regclass('public.platform_events') IS NULL THEN skip('platform_events table is not present', 1)
  ELSE ok(
    NOT has_table_privilege('anon', 'public.platform_events', 'INSERT')
      AND NOT has_table_privilege('anon', 'public.platform_events', 'SELECT'),
    'anon cannot write or read platform events'
  )
END;

SELECT CASE
  WHEN to_regclass('public.probe_events') IS NULL THEN skip('probe_events table is not present', 1)
  ELSE ok(
    has_table_privilege('anon', 'public.probe_events', 'INSERT')
      AND NOT has_table_privilege('anon', 'public.probe_events', 'SELECT')
      AND EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'probe_events'
          AND cmd = 'SELECT'
          AND coalesce(qual, '') ILIKE '%false%'
      ),
    'anon may append probe events and cannot read them back'
  )
END;

SELECT * FROM finish();

ROLLBACK;
