import { STORAGE_KEYS, type KeyValueStore } from '../storage/ports';

export interface GuardState {
  readonly failures: number;
  readonly lockedUntil: number;
}

const FREE_ATTEMPTS = 3;
const BASE_PENALTY_MS = 30_000;
const MAX_PENALTY_MS = 6 * 60 * 60 * 1000;

const INITIAL: GuardState = { failures: 0, lockedUntil: 0 };

/**
 * Throttles unlock attempts with a penalty that doubles per failure and
 * survives a restart.
 *
 * This raises the cost of guessing at the UI — a borrowed or unattended
 * device — and nothing more. An attacker holding the storage file can reset
 * this counter at will; the defence against that is the Argon2id cost in
 * `kdf.ts`, which they cannot edit without invalidating the AEAD tag.
 */
export class UnlockGuard {
  constructor(private readonly store: KeyValueStore) {}

  private async read(): Promise<GuardState> {
    const state = await this.store.get<GuardState>(STORAGE_KEYS.unlockGuard);
    if (!state || typeof state.failures !== 'number' || typeof state.lockedUntil !== 'number') {
      return INITIAL;
    }
    return state;
  }

  /** Milliseconds the caller must wait, or 0 when an attempt is allowed now. */
  async remainingLockout(now: number = Date.now()): Promise<number> {
    const state = await this.read();
    return Math.max(0, state.lockedUntil - now);
  }

  /** Called before deriving the key, so a locked-out attempt costs no CPU. */
  async assertAttemptAllowed(now: number = Date.now()): Promise<void> {
    const remaining = await this.remainingLockout(now);
    if (remaining > 0) {
      throw new UnlockThrottledError(remaining);
    }
  }

  async recordFailure(now: number = Date.now()): Promise<GuardState> {
    const state = await this.read();
    const failures = state.failures + 1;
    // The third wrong password is the first that costs time; each one after doubles the wait.
    const penaltyStep = failures - FREE_ATTEMPTS + 1;
    const lockedUntil =
      penaltyStep > 0 ? now + Math.min(BASE_PENALTY_MS * 2 ** (penaltyStep - 1), MAX_PENALTY_MS) : 0;
    const next: GuardState = { failures, lockedUntil };
    await this.store.set(STORAGE_KEYS.unlockGuard, next);
    return next;
  }

  async recordSuccess(): Promise<void> {
    await this.store.remove(STORAGE_KEYS.unlockGuard);
  }
}

export class UnlockThrottledError extends Error {
  constructor(public readonly retryInMs: number) {
    super(`Too many failed attempts. Try again in ${Math.ceil(retryInMs / 1000)}s.`);
    this.name = 'UnlockThrottledError';
  }
}
