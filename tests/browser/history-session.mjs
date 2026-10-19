/** Headless, synthetic auth only. Never connects to a real Supabase account. */
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.HISTORY_TEST_BASE_URL || 'http://127.0.0.1:3000';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local test server only');
const project = 'https://history-test.supabase.co';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'synthetic@example.invalid',
  email_confirmed_at: '2026-10-14T00:00:00Z',
  user_metadata: { auth_provider: 'joey' },
  app_metadata: { provider: 'email', providers: ['email'] },
  created_at: '2026-10-14T00:00:00Z',
};
const expires = Math.floor(Date.now() / 1000) + 3600;
const jwt =
  [
    { alg: 'HS256', typ: 'JWT' },
    { sub: user.id, exp: expires, iat: expires - 3600, aud: 'authenticated' },
  ]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.') + '.synthetic';
const session = {
  access_token: jwt,
  refresh_token: 'synthetic-only',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: expires,
  user,
};
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  async function context(signedIn) {
    const ctx = await browser.newContext();
    await ctx.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      if (url.origin !== project) return route.abort();
      if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
      if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
      return route.abort();
    });
    if (signedIn)
      await ctx.addInitScript(
        ({ session }) => {
          if (!sessionStorage.getItem('history-test-seeded')) {
            localStorage.setItem('sb-history-test-auth-token', JSON.stringify(session));
            sessionStorage.setItem('history-test-seeded', 'true');
          }
        },
        { session },
      );
    return ctx;
  }
  const signedOut = await context(false);
  const page = await signedOut.newPage();
  await page.goto(`${base}/auth`);
  await page.getByRole('heading', { name: 'Sign in to your wallet', exact: true }).waitFor();
  await page.goto(`${base}/privacy`);
  await page.goBack();
  await page.getByRole('heading', { name: 'Sign in to your wallet', exact: true }).waitFor();
  await page.goForward();
  assert(new URL(page.url()).pathname === '/privacy');
  console.log('PASS signed-out Back/Forward');
  await signedOut.close();

  const signedIn = await context(true);
  const member = await signedIn.newPage();
  await member.goto(`${base}/auth`);
  await member.waitForURL('**/balances');
  await member.getByRole('heading', { name: 'Watch only balances', exact: true }).waitFor();
  assert.equal(await member.locator('input[type=password]').count(), 0);
  await member.goto(`${base}/privacy`);
  await member.goto(`${base}/auth`);
  await member.waitForURL('**/balances');
  assert.equal(await member.locator('input[type=password]').count(), 0);
  console.log('PASS signed-in auth redirect before form');
  await member.getByRole('button', { name: 'Sign out', exact: true }).click();
  await member.waitForURL('**/auth');
  await member.getByRole('heading', { name: 'Sign in to your wallet', exact: true }).waitFor();
  await member.goBack();
  await member.goBack();
  await member.waitForURL('**/auth');
  await member.getByRole('heading', { name: 'Sign in to your wallet', exact: true }).waitFor();
  assert.equal(
    await member.getByRole('heading', { name: 'Watch only balances', exact: true }).count(),
    0,
  );
  assert.equal(
    await member.evaluate(() => localStorage.getItem('sb-history-test-auth-token')),
    null,
  );
  console.log('PASS sign-out then Back into earlier protected history');
  await member.goForward();
  await member.goForward();
  await member.waitForURL('**/auth');
  await member.getByRole('heading', { name: 'Sign in to your wallet', exact: true }).waitFor();
  console.log('PASS Forward cannot restore signed-out session');
  await member.screenshot({ path: '.codex-temp/history-signout-qa.png' });
  await signedIn.close();
} finally {
  await browser.close();
}
