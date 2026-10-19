-- Fail when any ordinary public table is missing row level security.
DO $$
DECLARE
  table_count integer;
  missing text;
BEGIN
  SELECT count(*)
  INTO table_count
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r';

  IF table_count = 0 THEN
    RAISE EXCEPTION 'No public tables exist after migrations.';
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
  INTO missing
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Row level security is disabled on: %', missing;
  END IF;
END $$;
