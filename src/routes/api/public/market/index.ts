import { createFileRoute } from '@tanstack/react-router';
import { marketProxy } from '@/lib/market.server';
export const Route = createFileRoute('/api/public/market/')({
  server: { handlers: { GET: ({ request }) => marketProxy(request) } },
});
