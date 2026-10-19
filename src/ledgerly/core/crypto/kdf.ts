import { argon2idAsync } from '@noble/hashes/argon2.js';
import { utf8ToBytes, wipe } from './bytes';

/**
 * Argon2id parameters. Memory-hardness is what makes an offline attack against
 * a stolen vault expensive on GPUs and ASICs, which PBKDF2 cannot provide at
 * any iteration count. These sit at the interactive end of RFC 9106's guidance
 * so unlocking stays responsive in a service worker.
 */
export interface KdfParams {
  readonly algorithm: 'argon2id';
  /** Memory cost in kibibytes. */
  readonly m: number;
  /** Time cost in iterations. */
  readonly t: number;
  /** Parallelism. */
  readonly p: number;
  /** Argon2 version, 0x13. */
  readonly version: number;
}

/**
 * OWASP's `m=47104, t=1, p=1` profile.
 *
 * Argon2 is single-threaded here — `p` above 1 changes the algorithm's shape
 * but buys no speed in JavaScript — so cost has to come from memory or passes.
 * Memory is the better lever: it is what makes purpose-built cracking hardware
 * expensive, whereas extra passes cost the attacker and the user alike. This
 * profile and `m=19456, t=2` are rated equivalent by OWASP, and the
 * high-memory one measured roughly four times faster to unlock.
 */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: 'argon2id',
  m: 47104,
  t: 1,
  p: 1,
  version: 0x13,
};

const MIN_MEMORY_KIB = 19456;
/** `m × t` of OWASP's weakest listed profile; the floor no vault may drop below. */
const MIN_WORK_FACTOR = 19456 * 2;
const DERIVED_KEY_BYTES = 32;

/**
 * Rejects parameters weaker than OWASP's guidance.
 *
 * A vault file is attacker-controlled input once a device is compromised, so
 * accepting whatever cost it names would let an attacker rewrite the header to
 * something trivially brute-forceable and then test guessed passwords against
 * it cheaply. The check is on the product of memory and passes, since those
 * trade off against each other, plus an absolute memory floor so the work
 * cannot be met with passes over a tiny buffer that fits in cache.
 */
export function assertKdfParams(params: KdfParams): void {
  if (params.algorithm !== 'argon2id') {
    throw new Error(`unsupported key derivation algorithm: ${String(params.algorithm)}`);
  }
  if (params.version !== 0x13) {
    throw new Error('unsupported Argon2 version');
  }
  if (!Number.isInteger(params.m) || params.m < MIN_MEMORY_KIB) {
    throw new Error('key derivation memory cost is below the accepted minimum');
  }
  if (!Number.isInteger(params.t) || params.t < 1) {
    throw new Error('key derivation time cost is below the accepted minimum');
  }
  if (params.m * params.t < MIN_WORK_FACTOR) {
    throw new Error('key derivation work factor is below the accepted minimum');
  }
  if (!Number.isInteger(params.p) || params.p < 1 || params.p > 4) {
    throw new Error('key derivation parallelism is out of range');
  }
}

export interface DeriveOptions {
  readonly onProgress?: (fraction: number) => void;
}

/**
 * Derives the vault encryption key. The async variant yields to the event loop
 * every few milliseconds so a long derivation cannot stall the worker that is
 * also servicing the unlock UI.
 */
export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
  options: DeriveOptions = {},
): Promise<Uint8Array> {
  assertKdfParams(params);
  if (salt.length < 16) {
    throw new Error('key derivation salt must be at least 16 bytes');
  }

  const passwordBytes = utf8ToBytes(password.normalize('NFKC'));
  try {
    return await argon2idAsync(passwordBytes, salt, {
      m: params.m,
      t: params.t,
      p: params.p,
      version: params.version,
      dkLen: DERIVED_KEY_BYTES,
      asyncTick: 8,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    });
  } finally {
    wipe(passwordBytes);
  }
}
