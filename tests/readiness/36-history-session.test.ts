import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAuthEntry } from '@/lib/auth-entry';
import { guardHistoryRestore } from '@/lib/history-session';

function client() {
  const user = { id: 'synthetic-user', email_confirmed_at: '2026-10-14', user_metadata: {} };
  const session = { access_token: 'synthetic-session', user };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
  };
  return { auth, typed: auth as unknown as SupabaseClient['auth'], user, session };
}

describe('history navigation authorization', () => {
  it('does not use history or make a user request when signed out', async () => {
    const c = client();
    c.auth.getSession.mockResolvedValue({ data: { session: null! }, error: null });
    expect(await readAuthEntry(c.typed)).toBeNull();
    expect(c.auth.getUser).not.toHaveBeenCalled();
  });

  it('checks the exact current token with the server', async () => {
    const c = client();
    expect(await readAuthEntry(c.typed)).toEqual(c.user);
    expect(c.auth.getUser).toHaveBeenCalledWith('synthetic-session');
  });

  it('rejects a successful result that arrives after sign-out', async () => {
    const c = client();
    c.auth.getSession.mockResolvedValueOnce({ data: { session: c.session }, error: null });
    c.auth.getSession.mockResolvedValueOnce({ data: { session: null! }, error: null });
    expect(await readAuthEntry(c.typed)).toBeNull();
  });

  it('does not restore an earlier session after another sign-in', async () => {
    const c = client();
    c.auth.getSession.mockResolvedValueOnce({ data: { session: c.session }, error: null });
    c.auth.getSession.mockResolvedValueOnce({
      data: { session: { ...c.session, access_token: 'new-synthetic-session' } },
      error: null,
    });
    expect(await readAuthEntry(c.typed)).toBeNull();
  });

  it('rejects a mismatched user', async () => {
    const c = client();
    c.auth.getUser.mockResolvedValue({
      data: { user: { ...c.user, id: 'another-user' } },
      error: null,
    });
    expect(await readAuthEntry(c.typed)).toBeNull();
  });

  it('fails closed on a server outage without clearing stored credentials', async () => {
    const c = client();
    c.auth.getUser.mockRejectedValue(new Error('synthetic outage'));
    await expect(readAuthEntry(c.typed)).rejects.toThrow('synthetic outage');
    expect(c.auth.getSession).toHaveBeenCalledTimes(1);
  });

  it('allows fresh sign-in when the server rejects the old token', async () => {
    const c = client();
    c.auth.getUser.mockResolvedValue({ data: { user: null! }, error: { status: 401 } as never });
    expect(await readAuthEntry(c.typed)).toBeNull();
  });

  it('does not mistake a returned server outage for signed-out success', async () => {
    const c = client();
    c.auth.getUser.mockResolvedValue({ data: { user: null! }, error: { status: 503 } as never });
    await expect(readAuthEntry(c.typed)).rejects.toThrow('Could not check sign-in');
  });

  it('hides cached content before leaving and reloads a restored document', () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const page = { documentElement: { style: { visibility: '' } } };
    Object.assign(target, { location: { reload } });
    const stop = guardHistoryRestore(target as unknown as Window, page as unknown as Document);
    target.dispatchEvent(new Event('pagehide'));
    expect(page.documentElement.style.visibility).toBe('hidden');
    const restored = Object.assign(new Event('pageshow'), { persisted: true });
    target.dispatchEvent(restored);
    expect(reload).toHaveBeenCalledOnce();
    expect(page.documentElement.style.visibility).toBe('hidden');
    stop();
    expect(page.documentElement.style.visibility).toBe('');
    target.dispatchEvent(restored);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps an ordinary page display visible without reloading', () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const page = { documentElement: { style: { visibility: '' } } };
    Object.assign(target, { location: { reload } });
    const stop = guardHistoryRestore(target as unknown as Window, page as unknown as Document);
    target.dispatchEvent(new Event('pagehide'));
    target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(reload).not.toHaveBeenCalled();
    expect(page.documentElement.style.visibility).toBe('');
    stop();
  });
});
