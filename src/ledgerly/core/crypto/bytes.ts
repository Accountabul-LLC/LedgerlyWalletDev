import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export { bytesToHex, concatBytes, hexToBytes, utf8ToBytes };

const HEX_PATTERN = /^[0-9a-fA-F]*$/;

export function isHex(value: string): boolean {
  return value.length % 2 === 0 && HEX_PATTERN.test(value);
}

/**
 * Overwrites buffers that held secret material. JavaScript offers no guarantee
 * that the engine kept a single copy, so this reduces exposure rather than
 * eliminating it: secrets are held as byte arrays, never strings, wherever the
 * surrounding code allows it.
 */
export function wipe(...buffers: (Uint8Array | null | undefined)[]): void {
  for (const buffer of buffers) {
    if (buffer) buffer.fill(0);
  }
}

/** Compares two byte arrays without leaking the position of the first difference. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
