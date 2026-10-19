import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const { from, maybeSingle, fetchMock } = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  fetchMock: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock('@/lib/market.server', () => ({ readBoundedBytes: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from } }));
import { Route } from '@/routes/api/public/tokens/sync';
const post = (
  Route as unknown as {
    server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TOKEN_SYNC_SECRET', '');
  vi.stubGlobal('fetch', fetchMock);
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
  maybeSingle.mockResolvedValue({ data: { token: 'database-job-secret' } });
  fetchMock.mockRejectedValue(new Error('Synthetic upstream unavailable'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const request = (headers: HeadersInit = {}) =>
  post({
    request: new Request('https://example.test/api/public/tokens/sync', {
      method: 'POST',
      headers,
    }),
  });

test('missing credentials are rejected without a database or upstream call', async () => {
  expect((await request()).status).toBe(401);
  expect(from).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
test('wrong credentials and database outages stay closed', async () => {
  expect((await request({ 'x-token-sync-secret': 'wrong' })).status).toBe(401);
  maybeSingle.mockRejectedValue(new Error('Database unavailable'));
  expect((await request({ 'x-token-sync-secret': 'wrong' })).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});
test('a matching database job secret reaches the upstream operation', async () => {
  expect((await request({ authorization: 'bearer database-job-secret' })).status).toBe(502);
  expect(from).toHaveBeenCalledWith('cron_tokens');
  expect(fetchMock).toHaveBeenCalledOnce();
});
test('a matching environment secret works independently of database lookup', async () => {
  vi.stubEnv('TOKEN_SYNC_SECRET', 'host-job-secret');
  expect((await request({ 'x-token-sync-secret': 'host-job-secret' })).status).toBe(502);
  expect(from).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledOnce();
});
