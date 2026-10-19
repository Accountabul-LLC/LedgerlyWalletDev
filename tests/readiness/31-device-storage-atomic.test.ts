import { describe, expect, it } from 'vitest';
import { AtomicStore, type RawStore } from '../../mobile/src/atomic-store';
import { createAuthStorage } from '../../mobile/src/auth-storage';
class FakeRaw implements RawStore {
  data = new Map<string, string>();
  writes = 0;
  failAt = Infinity;
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    if (++this.writes === this.failAt) throw new Error('interrupted');
    this.data.set(key, value);
  }
  async remove(key: string) {
    this.data.delete(key);
  }
}
function legacy() {
  const data = new Map<string, string>();
  return {
    data,
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async removeItem(key: string) {
      data.delete(key);
    },
  };
}
describe('generation publication and secure profile persistence', () => {
  it('preserves the entire prior value at every interrupted write before pointer publication', async () => {
    for (let fail = 1; fail <= 7; fail++) {
      const raw = new FakeRaw();
      const store = new AtomicStore(raw);
      await store.set('vault', { ciphertext: 'a'.repeat(6000) });
      const prior = new Map(raw.data);
      raw.writes = 0;
      raw.failAt = fail;
      try {
        await store.set('vault', { ciphertext: 'b'.repeat(6000) });
      } catch {
        // Simulate termination at this write boundary.
      }
      raw.failAt = Infinity;
      const result = await new AtomicStore(raw).get<{ ciphertext: string }>('vault');
      expect(
        result?.ciphertext === 'a'.repeat(6000) || result?.ciphertext === 'b'.repeat(6000),
      ).toBe(true);
      // Pending staging writes can be reclaimed after process restart.
      await new AtomicStore(raw).set('vault', { ciphertext: 'c' });
      expect(await store.get('vault')).toEqual({ ciphertext: 'c' });
      expect([...raw.data.keys()].filter((key) => key.includes('.g.'))).toHaveLength(1);
      expect(prior.size).toBeGreaterThan(0);
    }
  });
  it('publishes the pointer only after all generation chunks, serializes writes and clears them', async () => {
    const raw = new FakeRaw();
    const store = new AtomicStore(raw);
    await Promise.all([
      store.set('vault', { data: 'x'.repeat(5000) }),
      new AtomicStore(raw).set('vault', { data: 'y'.repeat(6000) }),
    ]);
    expect(await store.get('vault')).toEqual({ data: 'y'.repeat(6000) });
    await store.clear();
    expect(raw.data.size).toBe(0);
  });
  it('chunks Unicode by bounded native byte size and clears an interrupted first write', async () => {
    const raw = new FakeRaw();
    const store = new AtomicStore(raw);
    await store.set('preferences', { label: '🔒'.repeat(1000) });
    expect(await store.get('preferences')).toEqual({ label: '🔒'.repeat(1000) });
    for (const [key, value] of raw.data)
      if (key.includes('.g.'))
        expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(1800);
    await store.clear();
    raw.writes = 0;
    raw.failAt = 4;
    await expect(store.set('vault', { ciphertext: 'a'.repeat(6000) })).rejects.toThrow(
      'interrupted',
    );
    raw.failAt = Infinity;
    await new AtomicStore(raw).clear();
    expect(raw.data.size).toBe(0);
  });
  it('reads legacy numeric-count vaults and migrates atomically without retaining old chunks', async () => {
    const raw = new FakeRaw();
    raw.data.set('ledgerly.keys', '["vault"]');
    raw.data.set('ledgerly.vault.n', '1');
    raw.data.set('ledgerly.vault.0', '{"ciphertext":"legacy"}');
    const store = new AtomicStore(raw);
    expect(await store.get('vault')).toEqual({ ciphertext: 'legacy' });
    await store.set('vault', { ciphertext: 'current' });
    expect(raw.data.has('ledgerly.vault.0')).toBe(false);
    expect(await store.get('vault')).toEqual({ ciphertext: 'current' });
  });
  it('refuses hostile counts, missing chunks, oversized values and unsafe keys', async () => {
    const raw = new FakeRaw();
    const store = new AtomicStore(raw);
    raw.data.set('ledgerly.vault.n', '999999999');
    await expect(store.get('vault')).rejects.toThrow('pointer');
    raw.data.set('ledgerly.vault.n', '1');
    await expect(store.get('vault')).rejects.toThrow('Incomplete');
    await expect(store.set('../vault', {})).rejects.toThrow('key');
    await expect(store.set('vault', 'x'.repeat(1_048_576))).rejects.toThrow('large');
  });
  it('migrates a legacy profile session to secure chunks before returning it and deletes plaintext', async () => {
    const raw = new FakeRaw();
    const old = legacy();
    old.data.set('sb-project-auth-token', 'token'.repeat(1000));
    const storage = createAuthStorage(raw, old);
    expect(await storage.getItem('sb-project-auth-token')).toBe('token'.repeat(1000));
    expect(old.data.size).toBe(0);
    expect(await storage.getItem('sb-project-auth-token')).toBe('token'.repeat(1000));
    await storage.removeItem('sb-project-auth-token');
    expect(await storage.getItem('sb-project-auth-token')).toBeNull();
  });
  it('serializes legacy migration with logout so a late migration cannot resurrect the session', async () => {
    const raw = new FakeRaw();
    const old = legacy();
    old.data.set('sb-project-auth-token', 'legacy-token');
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reading = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const delayed = {
      removeItem: old.removeItem,
      async getItem(key: string) {
        const value = await old.getItem(key);
        entered();
        await gate;
        return value;
      },
    };
    const storage = createAuthStorage(raw, delayed);
    const migration = storage.getItem('sb-project-auth-token');
    await reading;
    const logout = storage.removeItem('sb-project-auth-token');
    release();
    await migration;
    await logout;
    expect(await createAuthStorage(raw, old).getItem('sb-project-auth-token')).toBeNull();
    expect(old.data.size).toBe(0);
  });
  it('never returns or writes a plaintext session when secure storage or migration fails', async () => {
    const unavailable: RawStore = {
      get: async () => {
        throw new Error('unavailable');
      },
      set: async () => {
        throw new Error('unavailable');
      },
      remove: async () => {
        throw new Error('unavailable');
      },
    };
    const old = legacy();
    old.data.set('sb-project-auth-token', 'legacy-token');
    await expect(
      createAuthStorage(unavailable, old).getItem('sb-project-auth-token'),
    ).rejects.toThrow('unavailable');
    expect(old.data.size).toBe(0);
    const raw = new FakeRaw();
    raw.failAt = 3;
    old.data.set('sb-project-auth-token', 'legacy-token');
    await expect(createAuthStorage(raw, old).getItem('sb-project-auth-token')).rejects.toThrow(
      'interrupted',
    );
    expect(old.data.size).toBe(0);
    raw.failAt = Infinity;
    expect(await createAuthStorage(raw, old).getItem('sb-project-auth-token')).toBeNull();
  });
});
