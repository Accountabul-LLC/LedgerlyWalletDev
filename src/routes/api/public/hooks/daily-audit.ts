/**
 * Writes the daily code report for the live site.
 *
 * Called once a day on a schedule. It fingerprints the security-sensitive code
 * in the deployed build, compares it with the previous day's fingerprint and
 * publishes a report anyone can read at /security-center. Nothing secret is
 * touched: the job only hashes code that is already public.
 */
import { createFileRoute } from '@tanstack/react-router';
import { createHash, timingSafeEqual } from 'node:crypto';
import { canPublishLiveReport } from '@/lib/report-publish';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Constant-time compare over fixed-length digests, so no timing leak. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** The scheduled job proves itself with a token only our own database holds. */
async function expectedSecrets(): Promise<string[]> {
  const secrets: string[] = [];
  const fromEnv = process.env['AUDIT_CRON_SECRET'];
  if (fromEnv) secrets.push(fromEnv);
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data } = await supabaseAdmin
      .from('cron_tokens')
      .select('token')
      .eq('name', 'daily-audit')
      .maybeSingle();
    if (data?.token) secrets.push(data.token as string);
  } catch {
    // A database hiccup must not turn into an open endpoint.
  }
  return secrets;
}

async function run(request: Request): Promise<Response> {
  const expected = await expectedSecrets();
  if (!expected.length) {
    return new Response(JSON.stringify({ error: 'Not configured' }), {
      status: 503,
      headers: JSON_HEADERS,
    });
  }

  const provided =
    request.headers.get('x-audit-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!provided || !expected.some((secret) => secretMatches(provided, secret))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  // Preview and branch deployments share the production database. They must
  // not upsert a branch fingerprint over the published calendar day.
  if (!canPublishLiveReport()) {
    return new Response(JSON.stringify({ error: 'Production only' }), {
      status: 403,
      headers: JSON_HEADERS,
    });
  }

  const { FULL_AUDIT_FILE } = await import('@/lib/security-audit');
  const { generateDailyReport } = await import('@/lib/security-reports.server');

  try {
    const report = await generateDailyReport(FULL_AUDIT_FILE.replace('docs/security/', ''));
    return new Response(
      JSON.stringify({
        ok: true,
        date: report.date,
        status: report.status,
        changes: report.changes.length,
        filesWatched: report.filesWatched,
      }),
      { headers: JSON_HEADERS },
    );
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Failed' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}

export const Route = createFileRoute('/api/public/hooks/daily-audit')({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
