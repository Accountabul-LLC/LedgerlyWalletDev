import { expect, test } from 'vitest';
import { privateAnalyticsEvent } from '@/lib/analytics-privacy';

test('analytics strips confirmation, OAuth, recovery and fragment credentials', () => {
  for (const url of [
    'https://ledgerlywallet.com/auth/confirm?token_hash=private&type=signup',
    'https://ledgerlywallet.com/auth/callback?code=private',
    'https://ledgerlywallet.com/reset-password#access_token=private&refresh_token=private',
  ]) {
    const event = { type: 'pageview' as const, url };
    const result = privateAnalyticsEvent(event);
    expect(result?.url).toBe(`https://ledgerlywallet.com${new URL(url).pathname}`);
    expect(result?.url).not.toContain('private');
    expect(event.url).toBe(url);
  }
});
test('analytics rejects malformed or non-web URLs', () => {
  expect(privateAnalyticsEvent({ type: 'pageview', url: 'invalid' })).toBeNull();
  expect(privateAnalyticsEvent({ type: 'pageview', url: 'javascript:secret' })).toBeNull();
});
