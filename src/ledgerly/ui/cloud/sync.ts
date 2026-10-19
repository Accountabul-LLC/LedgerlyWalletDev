import { supabase } from '@/integrations/supabase/client';
import type { AccountView, Contact, WalletApi } from '@ledgerly/core/shared';
import { recallName } from '../name-memory';

/**
 * Optional cloud sync for labels only.
 *
 * Nothing secret leaves the device: recovery phrases, private keys, family
 * seeds and the unlock password are never read here, let alone uploaded. The
 * cloud holds names next to public addresses, which is a privacy tradeoff, not
 * a spending one.
 *
 * Reconciliation is last write wins with the local vault as the source of
 * truth: every local name is pushed, and cloud names only fill in wallets whose
 * local name is still the default one the app generated.
 */
export interface SyncResult {
  readonly pushedLabels: number;
  readonly pulledLabels: number;
  readonly pushedContacts: number;
  readonly pulledContacts: number;
}

const DEFAULT_LABEL = /^(Account|Wallet) \d+$/;

export async function syncLabels(
  wallet: Pick<WalletApi, 'renameAccount' | 'listContacts' | 'saveContact'>,
  accounts: readonly AccountView[],
  userId: string,
): Promise<SyncResult> {
  const { data: cloudLabels, error: labelError } = await supabase
    .from('wallet_labels')
    .select('address, name')
    .is('removed_at', null);
  if (labelError) throw new Error(labelError.message);

  const cloudByAddress = new Map((cloudLabels ?? []).map((row) => [row.address, row.name]));
  let pulledLabels = 0;
  const toPush: {
    user_id: string;
    address: string;
    name: string;
    provider: 'joey' | null;
    removed_at: null;
  }[] = [];

  for (const account of accounts) {
    const cloudName = cloudByAddress.get(account.address);
    if (cloudName && DEFAULT_LABEL.test(account.label) && cloudName !== account.label) {
      await wallet.renameAccount({ accountId: account.id, label: cloudName });
      pulledLabels += 1;
      continue;
    }
    if (cloudName !== account.label) {
      // removed_at is cleared on every push, so a wallet that came back to this
      // device stops being marked as removed in the profile.
      toPush.push({
        user_id: userId,
        address: account.address,
        name: account.label,
        provider: account.external?.provider ?? null,
        removed_at: null,
      });
    }
  }

  if (toPush.length > 0) {
    const { error } = await supabase
      .from('wallet_labels')
      .upsert(toPush, { onConflict: 'user_id,address' });
    if (error) throw new Error(error.message);
  }

  const localContacts = await wallet.listContacts();
  const { data: cloudContacts, error: contactError } = await supabase
    .from('contacts')
    .select('address, name, note');
  if (contactError) throw new Error(contactError.message);

  const localByAddress = new Map(localContacts.map((contact) => [contact.address, contact]));
  let pulledContacts = 0;
  for (const row of cloudContacts ?? []) {
    if (localByAddress.has(row.address)) continue;
    await wallet.saveContact({
      label: row.name,
      address: row.address,
      ...(row.note ? { note: row.note } : {}),
    });
    pulledContacts += 1;
  }

  const cloudContactAddresses = new Set((cloudContacts ?? []).map((row) => row.address));
  const contactsToPush = localContacts
    .filter((contact: Contact) => !cloudContactAddresses.has(contact.address))
    .map((contact: Contact) => ({
      user_id: userId,
      address: contact.address,
      name: contact.label,
      note: contact.note ?? null,
    }));
  if (contactsToPush.length > 0) {
    const { error } = await supabase
      .from('contacts')
      .upsert(contactsToPush, { onConflict: 'user_id,address' });
    if (error) throw new Error(error.message);
  }

  return {
    pushedLabels: toPush.length,
    pulledLabels,
    pushedContacts: contactsToPush.length,
    pulledContacts,
  };
}

/**
 * Removing a wallet from this device stops listing it in the profile, but the
 * name is kept next to the address so recovering the same wallet later brings
 * its name back instead of a generated one. The row is marked as removed, not
 * deleted, and it still holds nothing but a public address and a label. The
 * XRPL account itself is untouched.
 */
export async function forgetWalletLabels(addresses: readonly string[]): Promise<void> {
  if (addresses.length === 0) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const { error } = await supabase
    .from('wallet_labels')
    .update({ removed_at: new Date().toISOString() })
    .in('address', [...addresses]);
  if (error) throw new Error(error.message);
}

/**
 * The name a wallet had before it was removed from a device, so recovery can
 * restore it. Only the signed-in profile's own rows are visible.
 */
export async function recallCloudWalletName(address: string): Promise<string | null> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  const { data, error } = await supabase
    .from('wallet_labels')
    .select('name')
    .eq('address', address)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.name ?? null;
}

/** Same, for erasing every wallet on this device. */
export async function forgetAllWalletLabels(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  const { error } = await supabase.from('wallet_labels').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/**
 * The name to give a wallet that is coming back to this device: what this
 * browser remembers first, then what the signed-in profile remembers. Returns
 * null when neither knows the address, and the caller keeps its default name.
 */
export async function recallWalletName(address: string): Promise<string | null> {
  const local = recallName(address);
  if (local) return local;
  try {
    return await recallCloudWalletName(address);
  } catch {
    return null;
  }
}

/**
 * After a device is restored from the master recovery phrase, the derived
 * wallets come back with generated names. Any address this browser or the
 * profile still remembers gets its old name back, silently.
 */
export async function restoreRememberedNames(
  wallet: Pick<WalletApi, 'renameAccount'>,
  accounts: readonly AccountView[],
): Promise<number> {
  let renamed = 0;
  for (const account of accounts) {
    if (!DEFAULT_LABEL.test(account.label)) continue;
    const remembered = await recallWalletName(account.address).catch(() => null);
    if (!remembered || remembered === account.label) continue;
    await wallet.renameAccount({ accountId: account.id, label: remembered });
    renamed += 1;
  }
  return renamed;
}
