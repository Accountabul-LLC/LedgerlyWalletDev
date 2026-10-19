/**
 * All randomness flows through here so there is exactly one place to audit.
 * Math.random is never acceptable for any value in this package.
 */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError('random byte length must be a positive integer');
  }
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Uniform integer in [0, max) using rejection sampling to avoid modulo bias. */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 0x100000000) {
    throw new RangeError('max must be an integer in 1..2^32');
  }
  const ceiling = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0] as number;
  } while (value >= ceiling);
  return value % max;
}

/** Fisher-Yates using unbiased indices; used to shuffle seed-phrase quizzes. */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}
