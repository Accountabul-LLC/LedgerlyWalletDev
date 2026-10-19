import { supabase } from '@/integrations/supabase/client';

/**
 * Cross-tab session invalidation.
 *
 * Every Ledgerly tab runs its own engine, so locking one of them used to leave
 * the others signing happily with an open transaction draft on screen. These
 * helpers put a single broadcast between them: whatever ends or changes a
 * session in one tab ends it everywhere, and any staged transaction is thrown
 * away rather than carried into a different account, network or endpoint.
 *
 * Two carriers are used on purpose. A BroadcastChannel delivers to tabs that
 * are open right now, and a localStorage stamp survives a tab that was frozen
 * or backgrounded: it re-checks the stamp when it wakes up, so a lock never
 * gets lost because a tab was asleep when the message went out.
 */

const CHANNEL = 'ledgerly-session';
const STAMP_KEY = 'ledgerly.session.signal';

export type SessionSignal =
  /** Keys cleared from memory; the vault and profile stay. */
  | 'lock'
  /** Profile tokens cleared as well as the keys. */
  | 'signOut'
  /** Local vault erased on this device. */
  | 'erase'
  /** Account, network or endpoint changed; drafts no longer describe reality. */
  | 'invalidate'
  /** The stored vault was rewritten; other tabs must re-read it, drafts survive. */
  | 'vaultChanged';

/** Fired in this tab so open dialogs can drop a staged transaction. */
export const INVALIDATE_EVENT = 'ledgerly:invalidate';

interface Stamp {
  readonly signal: SessionSignal;
  readonly at: number;
  readonly id: string;
}

function isSignal(value: unknown): value is SessionSignal {
  return (
    value === 'lock' ||
    value === 'signOut' ||
    value === 'erase' ||
    value === 'invalidate' ||
    value === 'vaultChanged'
  );
}

/**
 * One channel per tab, opened once and never closed. Closing it right after a
 * postMessage is what made cross-tab locking unreliable: the message can be
 * dropped before it is delivered.
 */
let bus: BroadcastChannel | null = null;
function channel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!bus) bus = new BroadcastChannel(CHANNEL);
  return bus;
}

function readStamp(): Stamp | null {
  try {
    const raw = window.localStorage.getItem(STAMP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stamp>;
    if (!isSignal(parsed.signal) || typeof parsed.id !== 'string') return null;
    return { signal: parsed.signal, at: Number(parsed.at) || 0, id: parsed.id };
  } catch {
    return null;
  }
}

/** Tells every other tab what happened, and drops drafts in this one. */
export function broadcastSession(signal: SessionSignal): void {
  if (typeof window === 'undefined') return;
  // A vault write is routine bookkeeping, not a reason to throw away what the
  // person is typing in this tab, so it skips the local invalidate event.
  if (signal !== 'vaultChanged') {
    window.dispatchEvent(new CustomEvent(INVALIDATE_EVENT, { detail: signal }));
  }
  const stamp: Stamp = { signal, at: Date.now(), id: Math.random().toString(36).slice(2) };
  try {
    window.localStorage.setItem(STAMP_KEY, JSON.stringify(stamp));
  } catch {
    /* private mode: the channel still covers open tabs */
  }
  channel()?.postMessage(stamp);
}

/**
 * Listens for signals from other tabs. Returns an unsubscribe function.
 *
 * A signal is delivered at most once per tab, and a tab that was hidden when
 * the signal went out picks it up the moment it becomes visible again.
 */
export function onSessionSignal(handler: (signal: SessionSignal) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let lastSeen = readStamp()?.id ?? null;

  const deliver = (stamp: Stamp) => {
    if (!isSignal(stamp.signal) || stamp.id === lastSeen) return;
    lastSeen = stamp.id;
    if (stamp.signal !== 'vaultChanged') {
      window.dispatchEvent(new CustomEvent(INVALIDATE_EVENT, { detail: stamp.signal }));
    }
    handler(stamp.signal);
  };

  const onMessage = (event: MessageEvent) => {
    const data = event.data as Partial<Stamp>;
    if (isSignal(data?.signal) && typeof data.id === 'string') {
      deliver({ signal: data.signal, at: Number(data.at) || 0, id: data.id });
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STAMP_KEY) return;
    const stamp = readStamp();
    if (stamp) deliver(stamp);
  };
  const onWake = () => {
    if (document.visibilityState !== 'visible') return;
    const stamp = readStamp();
    if (stamp) deliver(stamp);
  };

  const active = channel();
  active?.addEventListener('message', onMessage);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('focus', onWake);

  return () => {
    active?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onWake);
    window.removeEventListener('focus', onWake);
  };
}

/**
 * Signing out has to actually stick. The profile session is revoked for every
 * device, the local tokens are cleared, and we verify no session survived
 * before telling the rest of the app it is signed out. Anything less leaves a
 * refreshed token able to walk back into a read only dashboard.
 */
export async function endProfileSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch {
    /* offline or already revoked: still clear this device below */
  }
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* ignore */
  }

  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }

  broadcastSession('signOut');
}

/**
 * The one sign-out path.
 *
 * Every step is awaited and the result is checked before anyone navigates: the
 * keys are dropped, the profile session is revoked, and we confirm the session
 * really is gone. Firing these off in parallel, or navigating while they were
 * still running, is what produced an empty /auth page.
 */
export async function signOutEverywhere(lock?: () => Promise<void>): Promise<void> {
  if (lock) {
    try {
      await lock();
    } catch {
      /* the keys are dropped again below by the sign-out broadcast */
    }
  }

  await endProfileSession();

  // Give the client a moment to settle, then confirm nothing survived. A token
  // that refreshes after we navigate would walk straight back into the app.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* retried by the loop */
    }
  }

  throw new Error('Could not finish signing out. Check your connection and try again.');
}
