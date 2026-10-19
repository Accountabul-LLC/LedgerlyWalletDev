import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_LABEL,
  forgetAllNames,
  recallName,
  rememberName,
  rememberNames,
} from '../../src/ledgerly/ui/name-memory';

/**
 * Wallet name recovery.
 *
 * Removing a wallet from a device must not lose the name the person gave it,
 * and the memory that makes that possible must never hold anything but public
 * addresses and labels.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

const ADDRESS = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const OTHER = 'rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem = (key: string) => this.map.get(key) ?? null;
  setItem = (key: string, value: string) => void this.map.set(key, value);
  removeItem = (key: string) => void this.map.delete(key);
  dump = () => JSON.stringify([...this.map.entries()]);
}

describe('remembered wallet names', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { window?: unknown }).window = { localStorage: storage };
  });

  it('brings a removed wallet name back on recovery', () => {
    rememberName(ADDRESS, 'Rent money');
    expect(recallName(ADDRESS)).toBe('Rent money');
  });

  it('does not remember generated names', () => {
    rememberName(ADDRESS, 'Account 2');
    rememberName(OTHER, 'Imported rPT1Sj');
    expect(recallName(ADDRESS)).toBeNull();
    expect(recallName(OTHER)).toBeNull();
    expect(DEFAULT_LABEL.test('Wallet 3')).toBe(true);
  });

  it('ignores anything that is not an XRPL address', () => {
    rememberNames([{ address: 'not-an-address', label: 'Sneaky' }]);
    expect(recallName('not-an-address')).toBeNull();
  });

  it('is erased with the device', () => {
    rememberName(ADDRESS, 'Rent money');
    forgetAllNames();
    expect(recallName(ADDRESS)).toBeNull();
  });

  it('stores no secret material, only addresses and labels', () => {
    rememberNames([
      { address: ADDRESS, label: 'Rent money' },
      { address: OTHER, label: 'Savings' },
    ]);
    const dumped = storage.dump();
    for (const word of ['mnemonic', 'seed', 'phrase', 'password', 'privateKey']) {
      expect(dumped.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});

describe('removed names stay out of the profile lists', () => {
  it('marks removed wallet names instead of deleting them', () => {
    const sync = read('src/ledgerly/ui/cloud/sync.ts');
    expect(sync).toContain('update({ removed_at:');
    expect(sync).not.toMatch(/forgetWalletLabels[\s\S]{0,400}\.delete\(\)/);
  });

  it('filters removed names out of every wallet listing', () => {
    for (const file of [
      'src/ledgerly/ui/cloud/sync.ts',
      'src/ledgerly/ui/views/ProfileBalances.tsx',
    ]) {
      const source = read(file);
      const selects = source.split("from('wallet_labels')").slice(1);
      for (const chunk of selects) {
        // Only the listing queries; recalling one remembered name is meant to
        // reach a removed row.
        if (!chunk.slice(0, 200).includes("select('address, name')")) continue;
        expect(chunk.slice(0, 400)).toContain('removed_at');
      }
    }
  });

  it('restores a remembered name during import and device restore', () => {
    expect(read('src/ledgerly/ui/views/AccountDialogs.tsx')).toContain('recallWalletName');
    expect(read('src/ledgerly/ui/views/Onboarding.tsx')).toContain('restoreRememberedNames');
  });
});
