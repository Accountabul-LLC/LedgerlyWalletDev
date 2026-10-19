import { createFileRoute } from '@tanstack/react-router';
import { marketProxy } from '@/lib/market.server';
export const Route = createFileRoute('/api/public/market/logo/$id')({
  server: { handlers: { GET: ({ request, params }) => marketProxy(request, params.id) } },
});
