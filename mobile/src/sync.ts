import type { AccountView, Contact, WalletApi } from '@ledgerly/core/shared';
import { supabase } from './supabase';

const DEFAULT_LABEL = /^(Account|Wallet) \d+$/;

export async function restoreRememberedNames(
  wallet: Pick<WalletApi, 'renameAccount'>,
  accounts: readonly AccountView[],
): Promise<number> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return 0;
  const { data, error } = await supabase
    .from('wallet_labels')
    .select('address, name')
    .is('removed_at', null);
  if (error || !data) return 0;

  const byAddress = new Map(data.map((row) => [row.address as string, row.name as string]));
  let renamed = 0;
  for (const account of accounts) {
    if (!DEFAULT_LABEL.test(account.label)) continue;
    const remembered = byAddress.get(account.address);
    if (!remembered || remembered === account.label) continue;
    await wallet.renameAccount({ accountId: account.id, label: remembered });
    renamed += 1;
  }
  return renamed;
}

export async function pushWalletLabels(
  wallet: Pick<WalletApi, 'listContacts'>,
  accounts: readonly AccountView[],
): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return;

  const labels = accounts.map((account) => ({
    user_id: userId,
    address: account.address,
    name: account.label,
    provider: account.external?.provider ?? null,
    removed_at: null,
  }));
  if (labels.length > 0) {
    const { error } = await supabase.from('wallet_labels').upsert(labels, {
      onConflict: 'user_id,address',
    });
    if (error) throw new Error(error.message);
  }

  const localContacts = await wallet.listContacts();
  const { data: cloudContacts, error: contactError } = await supabase
    .from('contacts')
    .select('address');
  if (contactError) throw new Error(contactError.message);
  const known = new Set((cloudContacts ?? []).map((row) => row.address as string));
  const toPush = localContacts
    .filter((contact: Contact) => !known.has(contact.address))
    .map((contact: Contact) => ({
      user_id: userId,
      address: contact.address,
      name: contact.label,
      note: contact.note ?? null,
    }));
  if (toPush.length > 0) {
    const { error } = await supabase.from('contacts').upsert(toPush, {
      onConflict: 'user_id,address',
    });
    if (error) throw new Error(error.message);
  }
}
