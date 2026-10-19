import { createFileRoute } from '@tanstack/react-router';
import { ActivityReportError, recordPublicActivity } from '@/lib/activity-record.server';
import { activityWritesAllowed } from '@/lib/activity-report';
import { activityNetwork } from '@/lib/platform-stats';
import { getPlatformTotals } from '@/lib/platform-stats.server';

export const Route = createFileRoute('/api/public/activity')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const network = activityNetwork.safeParse(
          new URL(request.url).searchParams.get('network') ?? 'mainnet',
        );
        if (!network.success) return Response.json({ error: 'Unknown network.' }, { status: 400 });
        const headers = { 'Cache-Control': 'no-store' };
        try {
          return Response.json(await getPlatformTotals(network.data), { headers });
        } catch {
          return Response.json({ error: 'Activity totals unavailable.' }, { status: 503, headers });
        }
      },
      POST: async ({ request }) => {
        const headers = { 'Cache-Control': 'no-store' };
        if (!activityWritesAllowed(process.env)) return Response.json({ ok: true }, { headers });
        try {
          const raw = await request.text();
          if (raw.length === 0 || raw.length > 2048) {
            return Response.json({ error: 'Invalid activity report.' }, { status: 400, headers });
          }
          const body: unknown = JSON.parse(raw);
          return Response.json(await recordPublicActivity(body), { headers });
        } catch (error) {
          if (error instanceof ActivityReportError) {
            return Response.json({ error: error.message }, { status: error.status, headers });
          }
          return Response.json({ error: 'Invalid activity report.' }, { status: 400, headers });
        }
      },
    },
  },
});
