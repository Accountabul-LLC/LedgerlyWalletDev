import { useCallback, useEffect, useState } from 'react';
import type { HistoryEntry } from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { useAsyncData } from '../store';
import { Button, EmptyState, Panel } from '../components/primitives';
import { ActivityRow } from '../components/ActivityRow';
import { explorerTxUrl } from '../format';
import { ContactDialog } from './Contacts';

export function Activity() {
  const { wallet, state, openExternal } = useWallet();
  const accountId = state.activeAccountId;
  const networkId = state.network.id;

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [marker, setMarker] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const contacts = useAsyncData(() => wallet.listContacts(), []);

  const load = useCallback(
    async (cursor: unknown, replace: boolean) => {
      if (!accountId) return;
      setLoading(true);
      setError(null);
      try {
        const page = await wallet.getHistory({
          accountId,
          ...(cursor === undefined ? {} : { marker: cursor }),
        });
        setEntries((current) => (replace ? [...page.entries] : [...current, ...page.entries]));
        setMarker(page.marker);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load activity.');
      } finally {
        setLoading(false);
      }
    },
    [accountId, wallet],
  );

  useEffect(() => {
    setEntries([]);
    setMarker(undefined);
    void load(undefined, true);
  }, [accountId, networkId, load]);

  if (!accountId) return <EmptyState>No account selected.</EmptyState>;

  return (
    <Panel eyebrow="History" title="Activity">
      {error ? (
        <div className="empty">
          {error}
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => void load(undefined, true)}>
              Try again
            </Button>
          </div>
        </div>
      ) : entries.length === 0 && !loading ? (
        <EmptyState>No transactions on this network yet.</EmptyState>
      ) : (
        <>
          {entries.map((entry) => (
            <ActivityRow
              key={entry.hash}
              entry={entry}
              accounts={state.accounts}
              contacts={contacts.data ?? []}
              networkId={networkId}
              networkLabel={state.network.label}
              showFee
              onSaveContact={(address) => setSaving(address)}
              onOpen={() => {
                const url = explorerTxUrl(state.network, entry.hash);
                if (url) openExternal(url);
              }}
            />
          ))}

          {marker !== undefined ? (
            <Button
              variant="secondary"
              block
              style={{ marginTop: 14 }}
              loading={loading}
              onClick={() => void load(marker, false)}
            >
              Load more
            </Button>
          ) : null}

          {loading && entries.length === 0 ? <EmptyState>Loading activity…</EmptyState> : null}
        </>
      )}

      {saving ? (
        <ContactDialog
          contact={null}
          defaultAddress={saving}
          onClose={() => setSaving(null)}
          onSaved={() => {
            setSaving(null);
            contacts.reload();
          }}
        />
      ) : null}
    </Panel>
  );
}
