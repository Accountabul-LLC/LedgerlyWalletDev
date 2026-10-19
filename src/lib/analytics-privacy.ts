import type { BeforeSendEvent } from '@vercel/analytics';

/** Confirmation and recovery URLs can contain credentials. Send paths only. */
export function privateAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
}
