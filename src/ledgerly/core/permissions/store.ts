import { STORAGE_KEYS, type KeyValueStore } from '../storage/ports';
import { isCanonicalOrigin } from './origin';

export interface SitePermission {
  readonly origin: string;
  /** Accounts this site may see. An empty list means the grant was revoked. */
  readonly accountIds: readonly string[];
  readonly grantedAt: number;
  readonly lastUsedAt: number;
}

type PermissionMap = Record<string, SitePermission>;

/**
 * Per-origin grants for connected sites.
 *
 * Permission is scoped to specific accounts rather than the wallet as a whole,
 * so connecting a trading site to one account does not expose the account
 * holding long-term funds. Approval is never implied: nothing here grants
 * anything without an explicit `grant` call, which only the approval flow makes.
 */
export class PermissionStore {
  private cache: PermissionMap | null = null;

  constructor(private readonly store: KeyValueStore) {}

  private async read(): Promise<PermissionMap> {
    if (this.cache) return this.cache;
    const stored = await this.store.get<PermissionMap>(STORAGE_KEYS.permissions);
    this.cache = stored ?? {};
    return this.cache;
  }

  private async write(map: PermissionMap): Promise<void> {
    this.cache = map;
    await this.store.set(STORAGE_KEYS.permissions, map);
  }

  async list(): Promise<SitePermission[]> {
    const map = await this.read();
    return Object.values(map).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  async get(origin: string): Promise<SitePermission | undefined> {
    const map = await this.read();
    return map[origin];
  }

  async isKnown(origin: string): Promise<boolean> {
    return (await this.get(origin)) !== undefined;
  }

  /**
   * Returns the accounts a site may use, filtered against the accounts that
   * still exist. An account removed from the wallet must not remain reachable
   * through a grant made before it was deleted.
   */
  async allowedAccounts(origin: string, existingAccountIds: readonly string[]): Promise<string[]> {
    const permission = await this.get(origin);
    if (!permission) return [];
    return permission.accountIds.filter((id) => existingAccountIds.includes(id));
  }

  async grant(origin: string, accountIds: readonly string[]): Promise<SitePermission> {
    if (!isCanonicalOrigin(origin)) {
      throw new Error('Refusing to store a permission for a non-canonical origin.');
    }
    if (accountIds.length === 0) {
      throw new Error('A site permission must include at least one account.');
    }
    const map = { ...(await this.read()) };
    const now = Date.now();
    const existing = map[origin];
    const permission: SitePermission = {
      origin,
      accountIds: [...new Set(accountIds)],
      grantedAt: existing?.grantedAt ?? now,
      lastUsedAt: now,
    };
    map[origin] = permission;
    await this.write(map);
    return permission;
  }

  async touch(origin: string): Promise<void> {
    const map = await this.read();
    const existing = map[origin];
    if (!existing) return;
    await this.write({ ...map, [origin]: { ...existing, lastUsedAt: Date.now() } });
  }

  async revoke(origin: string): Promise<void> {
    const map = { ...(await this.read()) };
    delete map[origin];
    await this.write(map);
  }

  async revokeAll(): Promise<void> {
    await this.write({});
  }

  /** Called when an account is deleted so no grant outlives its account. */
  async pruneAccount(accountId: string): Promise<void> {
    const map = { ...(await this.read()) };
    let changed = false;
    for (const [origin, permission] of Object.entries(map)) {
      if (!permission.accountIds.includes(accountId)) continue;
      const remaining = permission.accountIds.filter((id) => id !== accountId);
      changed = true;
      if (remaining.length === 0) {
        delete map[origin];
      } else {
        map[origin] = { ...permission, accountIds: remaining };
      }
    }
    if (changed) await this.write(map);
  }
}
