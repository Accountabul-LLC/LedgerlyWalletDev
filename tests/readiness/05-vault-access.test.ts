import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, assessPassword } from '@/ledgerly/core/vault/password';
import { UnlockGuard, UnlockThrottledError } from '@/ledgerly/core/vault/guard';
import { MemoryStore } from '@/ledgerly/core/storage/ports';
import { changeVaultPassword, createVault, resealVault } from '@/ledgerly/core/vault/vault';
import { emptyPayload } from '@/ledgerly/core/vault/schema';

describe('readiness: vault access control', () => {
  it('T39 weak, common and short passwords are refused', () => {
    for (const password of [
      '',
      'short',
      'password',
      'aaaaaaaaaaaa',
      'abcdefghijkl',
      '1234567890',
    ]) {
      expect(assessPassword(password).acceptable).toBe(false);
    }
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(10);
  });

  it('T40 strong passphrases are accepted with a high score', () => {
    const assessment = assessPassword('Quiet-Harbor-9-Lantern');
    expect(assessment.acceptable).toBe(true);
    expect(assessment.score).toBeGreaterThanOrEqual(3);
    expect(assessment.warnings.length).toBe(0);
  });

  it('T41 the meter always returns a bounded score and warning list', () => {
    const alphabet = 'aA1! zZ9?';
    for (let i = 0; i < 1_000; i += 1) {
      let password = '';
      const length = Math.floor(Math.random() * 30);
      for (let j = 0; j < length; j += 1)
        password += alphabet[Math.floor(Math.random() * alphabet.length)];
      const assessment = assessPassword(password);
      expect(assessment.score).toBeGreaterThanOrEqual(0);
      expect(assessment.score).toBeLessThanOrEqual(4);
      expect(Array.isArray(assessment.warnings)).toBe(true);
      if (assessment.acceptable)
        expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    }
  });

  it('T42 the unlock guard allows the first attempts then locks out', async () => {
    const guard = new UnlockGuard(new MemoryStore());
    const now = 1_000_000;
    await guard.assertAttemptAllowed(now);
    await guard.recordFailure(now);
    await guard.recordFailure(now);
    expect(await guard.remainingLockout(now)).toBe(0);
    await guard.recordFailure(now);
    expect(await guard.remainingLockout(now)).toBeGreaterThan(0);
    await expect(guard.assertAttemptAllowed(now)).rejects.toBeInstanceOf(UnlockThrottledError);
  });

  it('T43 lockout penalties grow and are capped', async () => {
    const guard = new UnlockGuard(new MemoryStore());
    const now = 0;
    let previous = 0;
    for (let i = 0; i < 20; i += 1) {
      await guard.recordFailure(now);
      const remaining = await guard.remainingLockout(now);
      expect(remaining).toBeGreaterThanOrEqual(previous);
      previous = remaining;
    }
    expect(previous).toBeLessThanOrEqual(6 * 60 * 60 * 1000);
  });

  it('T44 lockout state survives a restart and clears on success', async () => {
    const store = new MemoryStore();
    const now = 500_000;
    const first = new UnlockGuard(store);
    for (let i = 0; i < 4; i += 1) await first.recordFailure(now);
    const afterRestart = new UnlockGuard(store);
    expect(await afterRestart.remainingLockout(now)).toBeGreaterThan(0);
    await afterRestart.recordSuccess();
    expect(await afterRestart.remainingLockout(now)).toBe(0);
    await afterRestart.assertAttemptAllowed(now);
  });

  it('T45 lockout expires once the wait has passed', async () => {
    const guard = new UnlockGuard(new MemoryStore());
    for (let i = 0; i < 3; i += 1) await guard.recordFailure(0);
    const remaining = await guard.remainingLockout(0);
    expect(await guard.remainingLockout(remaining + 1)).toBe(0);
  });

  it('T47 every vault carries an identity and a generation that only moves forward', async () => {
    const { record, key } = await createVault('Quiet-Harbor-9-Lantern', emptyPayload(null));
    expect(typeof record.id).toBe('string');
    expect(record.id).not.toBe('');
    expect(record.generation).toBe(1);

    const second = await resealVault(record, key, emptyPayload(null));
    expect(second.id).toBe(record.id);
    expect(second.generation).toBe(2);

    const third = await resealVault(second, key, emptyPayload(null));
    expect(third.generation).toBe(3);
  });

  it('T48 changing the password keeps the vault identity and moves the generation on', async () => {
    const { record } = await createVault('Quiet-Harbor-9-Lantern', emptyPayload(null));
    const changed = await changeVaultPassword(
      record,
      'Quiet-Harbor-9-Lantern',
      'Lantern-4-Quiet-Harbor',
    );
    expect(changed).not.toBeNull();
    expect(changed!.record.id).toBe(record.id);
    expect(changed!.record.generation).toBe((record.generation ?? 0) + 1);
    expect(changed!.record.salt).not.toBe(record.salt);
  });

  it('T49 two vaults created on the same device never share an identity', async () => {
    const first = await createVault('Quiet-Harbor-9-Lantern', emptyPayload(null));
    const second = await createVault('Quiet-Harbor-9-Lantern', emptyPayload(null));
    expect(first.record.id).not.toBe(second.record.id);
  });

  it('T46 corrupt guard state falls back to the safe default', async () => {
    const store = new MemoryStore();
    await store.set('unlock-guard', { failures: 'lots', lockedUntil: null });
    const guard = new UnlockGuard(store);
    expect(await guard.remainingLockout(0)).toBe(0);
  });
});
