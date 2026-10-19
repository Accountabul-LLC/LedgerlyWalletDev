import {
  MAX_DESTINATION_TAG,
  resolveDestination,
  type AccountView,
  type Contact,
} from '@ledgerly/core/shared';

export interface RecipientSuggestion {
  key: string;
  source: 'contact' | 'wallet';
  label: string;
  address: string;
  destinationTag?: number;
  note?: string;
}

export function parseRecipientTag(value: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const tag = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(tag) || tag > MAX_DESTINATION_TAG) {
    throw new Error('Use a whole destination tag from 0 to 4294967295.');
  }
  return tag;
}

/** Search only local public wallet details and contacts; never resolve names remotely. */
export function findRecipients(
  query: string,
  accounts: readonly AccountView[],
  contacts: readonly Contact[],
): RecipientSuggestion[] {
  const text = query.trim().toLowerCase();
  if (!text) return [];
  const candidates: RecipientSuggestion[] = [
    ...contacts.map((contact) => ({
      ...contact,
      key: `contact:${contact.id}`,
      source: 'contact' as const,
    })),
    ...accounts.map((account) => ({
      key: `wallet:${account.id}`,
      source: 'wallet' as const,
      label: account.label,
      address: account.address,
    })),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      try {
        const resolved = resolveDestination(candidate.address);
        const tag = resolved.tagIsBound ? resolved.destinationTag : candidate.destinationTag;
        if (tag !== undefined) parseRecipientTag(String(tag));
        const identity = `${resolved.address}:${tag ?? ''}:${resolved.isTestAddress}`;
        if (
          !`${candidate.label}\n${candidate.address}`.toLowerCase().includes(text) ||
          seen.has(identity)
        )
          return false;
        candidate.destinationTag = tag;
        seen.add(identity);
        return true;
      } catch {
        return false;
      }
    })
    .slice(0, 8);
}
