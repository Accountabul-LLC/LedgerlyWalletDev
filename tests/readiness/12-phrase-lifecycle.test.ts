import { describe, expect, it } from 'vitest';
import { WalletEngine } from '@/ledgerly/core/engine/engine';
import { MemoryStore, type KeyValueStore } from '@/ledgerly/core/storage/ports';
import { MemorySessionStore } from '@/ledgerly/core/storage/session';

/**
 * Recovery phrase lifecycle.
 *
 * Containment on paper is not enough: these checks drive the real engine
 * through create, reveal, confirm, import and lock, then read back every byte
 * it persisted and prove the phrase is not among them in the clear.
 */

/** A store that also exposes the raw persisted bytes, so tests can grep them. */
class RecordingStore implements KeyValueStore {
  private readonly inner = new MemoryStore();
  readonly writes: string[] = [];

  async get<T>(key: string): Promise<T | undefined> {
    return this.inner.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.writes.push(JSON.stringify({ key, value }));
    await this.inner.set(key, value);
  }

  async remove(key: string): Promise<void> {
    await this.inner.remove(key);
  }

  async clear(): Promise<void> {
    await this.inner.clear();
  }

  /** Everything this store has ever been asked to hold, as one string. */
  everything(): string {
    return this.writes.join('\n');
  }
}

const PASSWORD = 'Quiet-Harbor-9-Lantern';
const KNOWN_PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
/** A throwaway family seed used only to prove it is never stored in the clear. */
const KNOWN_SEED = 'snoPBrXtMeMyMHUVTgbuqAfg1SUTb';

function newEngine(store: RecordingStore) {
  return new WalletEngine({ store, session: new MemorySessionStore(), version: 'test' });
}

/**
 * JSON literals such as `false` and `true` are also BIP39 words, so a stored
 * boolean would read as a leak on the phrases that happen to contain them.
 * Those two are excluded by name; every other wordlist entry still counts.
 */
const JSON_LITERAL_WORDS = new Set(['true', 'false', 'null']);

/** Fails if any word of the phrase shows up in the haystack. */
function expectNoPlaintext(haystack: string, phrase: string) {
  // Structural JSON keys such as "version" collide with wordlist entries, so
  // only the stored values are searched. Storage key names are structural too
  // ("unlock.guard" contains the word "guard"), so they are dropped first.
  // Whole-token matching keeps harmless substrings such as "main" inside
  // "mainnet" from reading as a leak.
  const values = haystack.replace(/"key":"[^"]*"/g, '').replace(/"[A-Za-z_]+":/g, ':');

  const words = phrase.split(' ');
  const leaked = words.filter(
    (word) =>
      word.length >= 4 &&
      !JSON_LITERAL_WORDS.has(word) &&
      new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`).test(values),
  );
  expect(leaked).toEqual([]);
}

describe('readiness: recovery phrase lifecycle', () => {
  it('T104 a created phrase never reaches storage in the clear', async () => {
    const store = new RecordingStore();
    const engine = newEngine(store);
    const { mnemonic } = await engine.createWallet({ password: PASSWORD });

    expect(mnemonic.split(' ').length).toBe(24);
    expectNoPlaintext(store.everything(), mnemonic);
    expect(store.everything()).not.toContain(PASSWORD);
  });

  it('T105 a restored phrase is encrypted, never echoed back to disk', async () => {
    const store = new RecordingStore();
    const engine = newEngine(store);
    await engine.createWallet({ password: PASSWORD, mnemonic: KNOWN_PHRASE });

    expectNoPlaintext(store.everything(), KNOWN_PHRASE);
    const vault = await store.get<{ ciphertext: string }>('vault');
    expect(vault?.ciphertext).toBeTruthy();
    expectNoPlaintext(vault?.ciphertext ?? '', KNOWN_PHRASE);
  });

  it('T106 the same phrase encrypts differently every time', async () => {
    const first = new RecordingStore();
    const second = new RecordingStore();
    await newEngine(first).createWallet({ password: PASSWORD, mnemonic: KNOWN_PHRASE });
    await newEngine(second).createWallet({ password: PASSWORD, mnemonic: KNOWN_PHRASE });

    const a = await first.get<{ ciphertext: string; salt: string; iv: string }>('vault');
    const b = await second.get<{ ciphertext: string; salt: string; iv: string }>('vault');
    expect(a?.ciphertext).not.toBe(b?.ciphertext);
    expect(a?.salt).not.toBe(b?.salt);
    expect(a?.iv).not.toBe(b?.iv);
  });

  it('T107 an imported family seed is never persisted in the clear', async () => {
    const store = new RecordingStore();
    const engine = newEngine(store);
    await engine.importFromSeed({ password: PASSWORD, seed: KNOWN_SEED });

    expect(store.everything()).not.toContain(KNOWN_SEED);
    expect(store.everything()).not.toContain(PASSWORD);
  });

  it('T108 revealing the phrase again costs the password', async () => {
    const store = new RecordingStore();
    const engine = newEngine(store);
    const { mnemonic } = await engine.createWallet({ password: PASSWORD });

    await expect(
      engine.exportRecoveryPhrase({ password: 'Wrong-Harbor-9-Lantern' }),
    ).rejects.toThrow();
    const revealed = await engine.exportRecoveryPhrase({ password: PASSWORD });
    expect(revealed.mnemonic).toBe(mnemonic);
    // Revealing writes nothing new in the clear.
    expectNoPlaintext(store.everything(), mnemonic);
  });

  it('T109 confirming the backup records a flag, not the phrase', async () => {
    const store = new RecordingStore();
    const engine = newEngine(store);
    const { mnemonic } = await engine.createWallet({ password: PASSWORD });
    await engine.confirmBackup();

    const preferences = await store.get<{ backupConfirmed: boolean }>('preferences');
    expect(preferences?.backupConfirmed).toBe(true);
    // Whole tokens only. A short word such as "act" is inside the key
    // activeAccountId and is not a stored phrase.
    const first = mnemonic.split(' ')[0] ?? '';
    if (!JSON_LITERAL_WORDS.has(first)) {
      const values = JSON.stringify(preferences).replace(/"[A-Za-z_]+":/g, ':');
      expect(values).not.toMatch(new RegExp(`(^|[^A-Za-z])${first}([^A-Za-z]|$)`));
    }
    expectNoPlaintext(store.everything(), mnemonic);
  });

  it('T110 locking clears the session copy of the phrase', async () => {
    const store = new RecordingStore();
    const session = new MemorySessionStore();
    const engine = new WalletEngine({ store, session, version: 'test' });
    const { mnemonic } = await engine.createWallet({ password: PASSWORD });

    expect(await session.read()).toBeTruthy();
    await engine.lock();
    expect(await session.read()).toBeUndefined();
    expect(engine.isUnlocked).toBe(false);
    expectNoPlaintext(store.everything(), mnemonic);
  });

  it('T111 an imported wallet has no phrase to hand out at all', async () => {
    const store = new RecordingStore();
    const engine = newEngine(store);
    await engine.importFromSeed({ password: PASSWORD, seed: KNOWN_SEED });
    await expect(engine.exportRecoveryPhrase({ password: PASSWORD })).rejects.toThrow(
      /no recovery phrase/i,
    );
  });

  it('T112 resetting the wallet leaves nothing behind', async () => {
    const store = new RecordingStore();
    const engine = newEngine(store);
    const { mnemonic } = await engine.createWallet({ password: PASSWORD });
    await engine.resetWallet({ confirmation: 'ERASE' });

    expect(await store.get('vault')).toBeUndefined();
    expect(await store.get('preferences')).toBeUndefined();
    expectNoPlaintext(store.everything(), mnemonic);
  });

  it('T125 unlocked session holds the phrase in memory; durable storage does not', async () => {
    const store = new RecordingStore();
    const session = new MemorySessionStore();
    const engine = new WalletEngine({ store, session, version: 'test' });
    const { mnemonic } = await engine.createWallet({ password: PASSWORD });

    expectNoPlaintext(store.everything(), mnemonic);
    const snapshot = await session.read();
    expect(snapshot?.payload.mnemonic).toBe(mnemonic);
    expect(store.writes.some((entry) => entry.includes('"key":"vault"'))).toBe(true);

    await engine.lock();
    expect(await session.read()).toBeUndefined();
    expectNoPlaintext(store.everything(), mnemonic);
  });
});
