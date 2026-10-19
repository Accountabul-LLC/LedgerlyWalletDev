type Challenge = { positions: number[]; salt: string; digests: string[] };

/** Salted so a digest cannot be looked up in the public 2048-word list. */
export async function digestWord(salt: string, word: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${word}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function pickPositions(total: number, count: number): number[] {
  const chosen = new Set<number>();
  const buffer = new Uint32Array(1);
  while (chosen.size < count && total > 0) {
    crypto.getRandomValues(buffer);
    chosen.add((buffer[0] as number) % total);
  }
  return [...chosen].sort((a, b) => a - b);
}

export async function buildChallenge(words: string[]): Promise<Challenge> {
  const positions = pickPositions(words.length, Math.min(3, words.length));
  const salt = randomSalt();
  const digests = await Promise.all(
    positions.map((position) => digestWord(salt, words[position] as string)),
  );
  return { positions, salt, digests };
}

export type { Challenge };
