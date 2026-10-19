CREATE TABLE public.security_reports (
  report_date DATE PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  files_watched INTEGER NOT NULL DEFAULT 0,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  full_audit TEXT NOT NULL DEFAULT '',
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.security_reports TO anon;
GRANT SELECT ON public.security_reports TO authenticated;
GRANT ALL ON public.security_reports TO service_role;

ALTER TABLE public.security_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Daily code reports are public to read"
  ON public.security_reports FOR SELECT
  TO anon, authenticated
  USING (true);