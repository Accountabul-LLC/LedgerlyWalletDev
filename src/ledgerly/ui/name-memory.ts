/**
 * Remembering wallet names across a removal.
 *
 * Removing a wallet from this device used to take its name with it, so
 * recovering the same address later came back as "Imported rXXXX" and had to be
 * renamed by hand. This is the small memory that fixes that: a plain map from
 * public XRPL address to the name the person gave it.
 *
 * What is stored here is deliberately boring. Addresses are public ledger data
 * and names are labels the person typed. No recovery phrase, no family seed, no
 * private key and no password ever reaches this module, and nothing here can be
 * used to move funds. It lives in localStorage so it survives a wallet being
 * removed from the vault, and it is erased whenever the device is erased or the
 * profile is deleted.
 */

import { isLedgerAddress } from '@/lib/ingest-guards';

const STORAGE_KEY = 'ledgerly.wallet-names';
const MAX_ENTRIES = 200;
const MAX_NAME = 40;

type NameMap = Record<string, string>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function read(): NameMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: NameMap = {};
    for (const [address, name] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof name !== 'string') continue;
      if (!isLedgerAddress(address)) continue;
      const trimmed = name.trim().slice(0, MAX_NAME);
      if (trimmed) out[address] = trimmed;
    }
    return out;
  } catch {
    return {};
  }
}

function write(map: NameMap): void {
  if (!isBrowser()) return;
  try {
    const entries = Object.entries(map).slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // A full or blocked storage is not a reason to fail a wallet action.
  }
}

/** Names that look auto-generated are not worth remembering. */
export const DEFAULT_LABEL = /^(Account|Wallet|Imported)\b/i;

export function rememberName(address: string, name: string): void {
  const trimmed = name.trim().slice(0, MAX_NAME);
  if (!address || !trimmed || DEFAULT_LABEL.test(trimmed)) return;
  const map = read();
  if (map[address] === trimmed) return;
  map[address] = trimmed;
  write(map);
}

export function rememberNames(entries: readonly { address: string; label: string }[]): void {
  for (const entry of entries) rememberName(entry.address, entry.label);
}

export function recallName(address: string): string | null {
  if (!address) return null;
  return read()[address] ?? null;
}

/** Erased with the device, so "remembered" never means "stuck here forever". */
export function forgetAllNames(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the entry is names only.
  }
}
