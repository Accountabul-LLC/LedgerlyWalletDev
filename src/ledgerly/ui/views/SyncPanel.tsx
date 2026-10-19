import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '../context';
import { useAsyncAction } from '../store';
import { Button, Callout, Panel } from '../components/primitives';
import { syncLabels, type SyncResult } from '../cloud/sync';

/**
 * Keeps wallet names and saved payees on the profile that is already signed in.
 *
 * Sign in lives on the /auth screen, so this panel never asks for credentials
 * again. It syncs once automatically when the wallet unlocks, and offers a
 * manual run for anyone who just renamed something. No key material is ever
 * sent: only public addresses and the names next to them.
 */
export function SyncPanel() {
  const { wallet, store, state } = useWallet();
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const autoRan = useRef(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    void supabase.auth.getSession().then(({ data: current }) => setSession(current.session));
    return () => data.subscription.unsubscribe();
  }, []);

  const sync = useAsyncAction(async () => {
    const userId = session?.user.id;
    if (!userId) throw new Error('Sign in to your profile first.');
    setResult(await syncLabels(wallet, state.accounts, userId));
    setLastSyncedAt(new Date().toLocaleTimeString());
    await store.refresh();
  });

  // First unlock of the session: push the wallet names up and pull anything
  // this browser is missing, so the profile is never silently empty.
  useEffect(() => {
    if (autoRan.current) return;
    if (!session?.user.id) return;
    if (state.accounts.length === 0) return;
    autoRan.current = true;
    void sync.run().catch(() => undefined);
  }, [session, state.accounts, sync]);

  if (!session) {
    return (
      <Panel eyebrow="Profile" title="Sync names">
        <p className="inline-note">
          Sign in to your profile to keep wallet names and saved payees with your account.
        </p>
      </Panel>
    );
  }

  return (
    <Panel eyebrow="Profile" title="Sync names">
      <p className="inline-note">
        Signed in as {session.user.email ?? 'your account'}. Your wallet names and saved payees
        follow you to another browser. Recovery phrases, keys and your password stay on this device
        and are never uploaded.
      </p>
      {sync.error ? <Callout tone="danger">{sync.error}</Callout> : null}
      {result ? (
        <Callout tone="info" title={lastSyncedAt ? `Synced at ${lastSyncedAt}` : 'Sync finished'}>
          {result.pushedLabels} names saved, {result.pulledLabels} names restored,{' '}
          {result.pushedContacts} payees saved, {result.pulledContacts} payees restored.
        </Callout>
      ) : null}
      <div className="button-row">
        <Button
          variant="accent"
          loading={sync.pending}
          onClick={() => void sync.run().catch(() => undefined)}
        >
          Sync now
        </Button>
      </div>
    </Panel>
  );
}
