import { splitChunks, joinChunks, CHUNK_CHARS } from './chunks';

export interface RawStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
interface Generation {
  g: string | null;
  n: number;
}
const MAX_CHUNKS = 600;
const MAX_KEYS = 64;
const MAX_CHARS = 1_048_576;
let sequence = 0;
// All instances share the queue so an engine restart cannot race an earlier write.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => {});
  return result;
}
function count(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= MAX_CHUNKS
  );
}
function generation(value: unknown): value is Generation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Generation;
  return count(v.n) && (v.g === null || (typeof v.g === 'string' && /^[a-z0-9-]{1,80}$/.test(v.g)));
}

/** Immutable generations ensure an interrupted replacement cannot overwrite active ciphertext. */
export class AtomicStore {
  constructor(
    private readonly raw: RawStore,
    private readonly prefix = 'ledgerly',
  ) {}
  private key(key: string): string {
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(key)) throw new Error('Invalid storage key');
    return `${this.prefix}.${key}`;
  }
  private piece(base: string, item: Generation, index: number) {
    return item.g === null ? `${base}.${index}` : `${base}.g.${item.g}.${index}`;
  }
  private async pointer(base: string): Promise<Generation | null> {
    const value = await this.raw.get(`${base}.n`);
    if (value === null) return null;
    if (/^[0-9]+$/.test(value)) {
      const n = Number(value);
      if (count(n)) return { g: null, n };
    } else {
      try {
        const item: unknown = JSON.parse(value);
        if (generation(item) && (item as Generation).g !== null) return item as Generation;
      } catch {
        /* Invalid pointers are rejected below. */
      }
    }
    throw new Error('Invalid storage pointer');
  }
  private async index(): Promise<string[]> {
    const value = await this.raw.get(`${this.prefix}.keys`);
    if (value === null) return [];
    const items: unknown = JSON.parse(value);
    if (
      !Array.isArray(items) ||
      items.length > MAX_KEYS ||
      items.some((key) => typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(key))
    )
      throw new Error('Invalid storage index');
    return [...new Set(items as string[])];
  }
  private async journal(base: string): Promise<Generation[]> {
    const value = await this.raw.get(`${base}.pending`);
    if (value === null) return [];
    const items: unknown = JSON.parse(value);
    if (!Array.isArray(items) || items.length > 4 || !items.every(generation))
      throw new Error('Invalid storage journal');
    return items;
  }
  private async cleanup(base: string): Promise<void> {
    const active = await this.pointer(base);
    for (const item of await this.journal(base)) {
      if (active && active.g === item.g) continue;
      for (let i = 0; i < item.n; i++) await this.raw.remove(this.piece(base, item, i));
    }
    await this.raw.remove(`${base}.pending`);
  }
  get<T>(key: string): Promise<T | undefined> {
    return serialized(async () => {
      const base = this.key(key);
      const active = await this.pointer(base);
      if (!active) {
        await this.cleanup(base).catch(() => {});
        return undefined;
      }
      const chunks: string[] = [];
      let size = 0;
      for (let i = 0; i < active.n; i++) {
        const value = await this.raw.get(this.piece(base, active, i));
        if (value === null || value.length > CHUNK_CHARS)
          throw new Error('Incomplete storage generation');
        size += value.length;
        if (size > MAX_CHARS) throw new Error('Storage value too large');
        chunks.push(value);
      }
      const result = JSON.parse(joinChunks(chunks)) as T;
      await this.cleanup(base).catch(() => {});
      return result;
    });
  }
  set<T>(key: string, value: T): Promise<void> {
    return serialized(async () => {
      const json = JSON.stringify(value);
      // ASCII escapes keep every native Keychain item below the byte cap, including Unicode metadata.
      const text =
        typeof json === 'string'
          ? json.replace(
              /[^\u0020-\u007e]/g,
              (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
            )
          : json;
      if (typeof text !== 'string' || text.length > MAX_CHARS)
        throw new Error('Storage value too large');
      const base = this.key(key);
      await this.cleanup(base);
      const old = await this.pointer(base);
      const pieces = splitChunks(text);
      const next: Generation = {
        g: `${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 14)}`,
        n: pieces.length,
      };
      const keys = await this.index();
      if (!keys.includes(key)) {
        if (keys.length >= MAX_KEYS) throw new Error('Storage key limit reached');
        const index = JSON.stringify([...keys, key]);
        if (index.length > CHUNK_CHARS) throw new Error('Storage key limit reached');
        await this.raw.set(`${this.prefix}.keys`, index);
      }
      // Index first so clear() can reclaim even an interrupted first-generation write.
      await this.raw.set(`${base}.pending`, JSON.stringify(old ? [old, next] : [next]));
      for (let i = 0; i < pieces.length; i++)
        await this.raw.set(this.piece(base, next, i), pieces[i]!);
      // Sole commit point. Prior ciphertext remains usable until this completes.
      await this.raw.set(`${base}.n`, JSON.stringify(next));
      // A cleanup failure must not report the already committed transaction as failed.
      await this.cleanup(base).catch(() => {});
    });
  }
  private async removeInternal(key: string): Promise<void> {
    const base = this.key(key);
    await this.cleanup(base);
    const old = await this.pointer(base);
    if (old) await this.raw.set(`${base}.pending`, JSON.stringify([old]));
    await this.raw.remove(`${base}.n`);
    await this.cleanup(base);
    const keys = await this.index();
    await this.raw.set(`${this.prefix}.keys`, JSON.stringify(keys.filter((item) => item !== key)));
  }
  remove(key: string): Promise<void> {
    return serialized(() => this.removeInternal(key));
  }
  clear(): Promise<void> {
    return serialized(async () => {
      for (const key of await this.index()) await this.removeInternal(key);
      await this.raw.remove(`${this.prefix}.keys`);
    });
  }
}
