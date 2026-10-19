-- pg_net ships with the Postgres default of EXECUTE for everyone, and both
-- anon and authenticated hold USAGE on its schema. Nothing in the app calls it
-- directly, so it is closed off; the scheduled job runs as the owner and keeps
-- working.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC, anon, authenticated;
REVOKE USAGE ON SCHEMA net FROM anon, authenticated;