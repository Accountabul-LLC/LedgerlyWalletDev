import type { Contact } from '@ledgerly/core/shared';

/**
 * Names for addresses.
 *
 * An address is correct but unreadable, so every list that shows one also
 * shows who it belongs to when we can tell: one of the user's own wallets
 * first, then the address book. Nothing here is authoritative, it is only a
 * label over an address the ledger already gave us.
 */
export interface NamedParty {
  readonly name: string;
  readonly kind: 'own' | 'contact';
}

interface NamedAccount {
  readonly label: string;
  readonly address: string;
}

export function resolveName(
  address: string | null | undefined,
  accounts: readonly NamedAccount[],
  contacts: readonly Contact[] = [],
): NamedParty | null {
  if (!address) return null;
  const own = accounts.find((account) => account.address === address);
  if (own) return { name: own.label, kind: 'own' };
  const contact = contacts.find((candidate) => candidate.address === address);
  if (contact) return { name: contact.label, kind: 'contact' };
  return null;
}

/** "from" for money coming in, "to" for money going out. */
export function directionWord(direction: 'in' | 'out' | 'self'): string {
  return direction === 'in' ? 'from' : 'to';
}
