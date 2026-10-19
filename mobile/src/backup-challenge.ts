import * as SecureStore from 'expo-secure-store';
import type { Challenge } from './challenge';

const KEY = 'ledgerly.backup-challenge';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'ledgerly.backup',
};

let remembered: Challenge | null = null;

function isChallenge(value: unknown): value is Challenge {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Challenge;
  return (
    Array.isArray(candidate.positions) &&
    candidate.positions.every((position) => Number.isInteger(position) && position >= 0) &&
    typeof candidate.salt === 'string' &&
    candidate.salt.length > 0 &&
    Array.isArray(candidate.digests) &&
    candidate.digests.length === candidate.positions.length &&
    candidate.digests.every((digest) => typeof digest === 'string' && digest.length > 0)
  );
}

/** Keeps the word quiz so Back can return to it after the phrase screen unmounts. */
export async function rememberChallenge(challenge: Challenge): Promise<void> {
  remembered = challenge;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(challenge), OPTIONS);
  } catch {
    /* The in-memory copy still covers this session. */
  }
}

export async function forgetChallenge(): Promise<void> {
  remembered = null;
  try {
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
  } catch {
    /* Already removed. */
  }
}

export async function loadChallenge(): Promise<Challenge | null> {
  if (remembered) return remembered;
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isChallenge(parsed)) return null;
    remembered = parsed;
    return parsed;
  } catch {
    return null;
  }
}
