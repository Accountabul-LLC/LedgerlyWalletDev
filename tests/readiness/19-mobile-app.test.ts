/**
 * Phone app readiness.
 *
 * The native host must keep the same secrets discipline as the web worker:
 * UI never imports the engine, only WALLET_METHODS are dispatched, the vault
 * store never sees a phrase in the clear, and AES-GCM on device matches the
 * audited WebCrypto boxes.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore, type KeyValueStore } from '@/ledgerly/core/storage/ports';
import { open, seal } from '@/ledgerly/core/crypto/aead';
import { randomBytes } from '@/ledgerly/core/crypto/random';
import { utf8ToBytes } from '@/ledgerly/core/crypto/bytes';
import { WALLET_METHODS } from '@/ledgerly/core/rpc/protocol';
import { installLedgerlyCrypto } from '../../mobile/src/crypto-polyfill';
import { joinChunks, splitChunks } from '../../mobile/src/chunks';
import { createMobileRuntime } from '../../mobile/src/runtime';
import { createWalletClient, WalletStore } from '../../mobile/src/client';
import type { WalletApi, WalletState } from '@/ledgerly/core/shared';
import type { MobileTransport } from '../../mobile/src/runtime';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(relative, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relative);
  }
  return out;
}

const MOBILE = walk('mobile/src');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

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
  everything(): string {
    return this.writes.join('\n');
  }
}

describe('readiness: ledgerly phone app', () => {
  it('T140 only the runtime module imports the wallet engine', () => {
    const offenders = MOBILE.filter((file) => {
      if (file.endsWith('runtime.ts')) return false;
      return /from ['"]@ledgerly\/core['"]/.test(read(file)) && !/import type /.test(read(file));
    });
    expect(offenders).toEqual([]);
  });

  it('T141 UI screens never import the runtime or the engine', () => {
    const screens = MOBILE.filter((file) => file.includes('/app/'));
    const offenders = screens.filter((file) =>
      /from ['"][^'"]*(runtime|engine\/engine|keyring\/)['"]/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('T142 the phone host dispatches only WALLET_METHODS', () => {
    const text = read('mobile/src/runtime.ts');
    expect(text).toMatch(/isWalletMethod\(request\.method\)/);
    expect(text).toContain('WalletEngine');
    expect(WALLET_METHODS).toContain('exportRecoveryPhrase');
  });

  it('T143 SecureStore chunks round-trip and stay under the Keychain size cap', () => {
    const payload = 'x'.repeat(5000);
    const chunks = splitChunks(payload);
    expect(chunks.every((chunk) => chunk.length <= 1800)).toBe(true);
    expect(joinChunks(chunks)).toBe(payload);
  });

  it('T144 noble AES-GCM opens a box sealed by WebCrypto', async () => {
    const key = randomBytes(32);
    const plain = utf8ToBytes('ledgerly-vault-interop');
    const aad = utf8ToBytes('header-v1');
    const nativeCrypto = globalThis.crypto;
    const box = await seal(key, plain, aad);
    try {
      installLedgerlyCrypto(nativeCrypto, { force: true });
      const opened = await open(key, box, aad);
      expect(opened).not.toBeNull();
      expect(Buffer.from(opened ?? []).toString()).toBe('ledgerly-vault-interop');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: nativeCrypto });
    }
  });

  it('T145 WebCrypto opens a box sealed by the phone polyfill', async () => {
    const nativeCrypto = globalThis.crypto;
    const key = randomBytes(32);
    const plain = utf8ToBytes('phone-sealed');
    const aad = utf8ToBytes('aad');
    try {
      installLedgerlyCrypto(nativeCrypto, { force: true });
      const box = await seal(key, plain, aad);
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: nativeCrypto });
      const opened = await open(key, box, aad);
      expect(opened).not.toBeNull();
      expect(Buffer.from(opened ?? []).toString()).toBe('phone-sealed');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: nativeCrypto });
    }
  });

  it('T146 creating a wallet through the phone runtime never stores the phrase in the clear', async () => {
    const store = new RecordingStore();
    const transport = createMobileRuntime(store);
    const wallet = createWalletClient(transport);
    const { mnemonic } = await wallet.createWallet({ password: 'Quiet-Harbor-9-Lantern' });
    expect(mnemonic.split(' ').length).toBeGreaterThanOrEqual(12);
    // JSON keys such as "version" are BIP39 words. Search stored values only,
    // matching the phrase-lifecycle scan, so schema names are not false leaks.
    const haystack = store
      .everything()
      .replace(/"key":"[^"]*"/g, '')
      .replace(/"[A-Za-z_]+":/g, ':');
    const leaked = mnemonic
      .split(' ')
      .filter(
        (word) =>
          word.length >= 4 &&
          word !== 'true' &&
          word !== 'false' &&
          word !== 'null' &&
          new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`).test(haystack),
      );
    expect(leaked).toEqual([]);
    await wallet.lock();
  });

  it('T147 clipboard writes live in one helper and recovery fields are secret', () => {
    const writers = MOBILE.filter((file) =>
      /Clipboard\.setStringAsync|clipboard\.writeText/.test(read(file)),
    );
    expect(writers).toEqual(['mobile/src/clipboard.ts']);
    const setup = read('mobile/src/app/setup.tsx');
    expect(setup).toMatch(/label="Recovery phrase"[\s\S]{0,80}secret/);
    expect(setup).toMatch(/label="Password"[\s\S]{0,80}secret/);
    expect(setup).toMatch(/useState\(false\)/);
    expect(setup).toMatch(/onPress=\{\(\) => setRevealed\(true\)\}/);
    expect(setup).not.toMatch(/useEffect\([^)]*setRevealed\(true\)/);
    expect(setup).not.toMatch(/0\.18/);
    expect(setup).toMatch(/preventScreenCaptureAsync\('ledgerly-phrase'\)/);
    expect(setup).toMatch(
      /importantForAccessibility=\{revealed \? 'auto' : 'no-hide-descendants'\}/,
    );
    expect(setup).toMatch(/revealed \? words\.current\[index\] : '••••'/);
    expect(setup).not.toMatch(/Copy recovery phrase/);
    expect(setup).toMatch(/hardwareBackPress/);
    expect(setup).toMatch(/label="← Back"/);
  });

  it('lock clears the in-memory session and wallet screens stay behind unlock', () => {
    const settings = read('mobile/src/app/(tabs)/settings.tsx');
    expect(settings).toMatch(/store\.lockSnapshot\(\)/);
    expect(settings).toMatch(/router\.replace\('\/unlock'\)/);
    const signedInBlock = settings.slice(settings.indexOf('{signedIn ? ('));
    expect(signedInBlock).toMatch(/Sync names to my profile/);
    expect(signedInBlock).toMatch(/Sign out of profile/);
    expect(read('mobile/src/guard.tsx')).toMatch(/href="\/unlock"/);
    expect(read('mobile/src/app/(tabs)/_layout.tsx')).toMatch(/UnlockedOnly/);
    for (const file of [
      'mobile/src/app/send.tsx',
      'mobile/src/app/receive.tsx',
      'mobile/src/app/scan.tsx',
    ]) {
      const source = read(file);
      expect(source).toMatch(/state\.status === 'locked'/);
      expect(source).toMatch(/<Redirect href="\/unlock" \/>/);
      expect(source).not.toMatch(/UnlockedOnly/);
    }
  });

  it('T148 the confirm step is never handed the phrase', () => {
    const setup = read('mobile/src/app/setup.tsx');
    expect(setup).toMatch(/function VerifyStep\(\{\s*challenge/);
    expect(setup).not.toMatch(/<VerifyStep[^>]*mnemonic/);
    expect(setup).toMatch(/digestWord\(challenge\.salt/);
    expect(read('mobile/src/challenge.ts')).toMatch(/\$\{salt\}:\$\{word\}/);
  });

  it('T149 no secret material is logged or fetched from the phone UI', () => {
    const offenders = MOBILE.filter((file) => {
      const text = stripComments(read(file));
      return (
        /console\.(log|info|warn|error)\([^)]*(mnemonic|seedPhrase|privateKey|familySeed)/i.test(
          text,
        ) || /fetch\([^)]*\b(mnemonic|seed|privateKey)\b/i.test(text)
      );
    });
    expect(offenders).toEqual([]);
  });

  it('locks the production runtime on background and refuses new sensitive work', async () => {
    const transport = createMobileRuntime(new MemoryStore());
    const wallet = createWalletClient(transport);
    await wallet.createWallet({ password: 'Quiet-Harbor-9-Lantern' });
    await transport.setActive(false);
    expect((await wallet.getState()).status).toBe('locked');
    await expect(wallet.unlock({ password: 'Quiet-Harbor-9-Lantern' })).rejects.toThrow(
      'Return to the app',
    );
    await transport.setActive(true);
    await wallet.unlock({ password: 'Quiet-Harbor-9-Lantern' });
    expect((await wallet.getState()).status).toBe('unlocked');
    await wallet.lock();
  });

  it('a late unlocked refresh cannot replace a newer locked production snapshot', async () => {
    let firstResolve!: (state: WalletState) => void;
    let secondResolve!: (state: WalletState) => void;
    const first = new Promise<WalletState>((resolve) => {
      firstResolve = resolve;
    });
    const second = new Promise<WalletState>((resolve) => {
      secondResolve = resolve;
    });
    let requests = 0;
    const wallet = { getState: () => (requests++ === 0 ? first : second) } as WalletApi;
    const transport = { subscribe: () => () => {} } as unknown as MobileTransport;
    const store = new WalletStore(wallet, transport);
    const old = store.refresh();
    const latest = store.refresh();
    secondResolve({ status: 'locked' } as WalletState);
    await latest;
    firstResolve({ status: 'unlocked' } as WalletState);
    await old;
    expect(store.getSnapshot()?.status).toBe('locked');
    store.lockSnapshot();
    expect(store.getSnapshot()?.accounts).toEqual([]);
  });
});
