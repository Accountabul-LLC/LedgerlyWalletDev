/** iOS Keychain has historically refused values much above 2 KiB. */
export const CHUNK_CHARS = 1800;

export function splitChunks(value: string, size = CHUNK_CHARS): string[] {
  if (size <= 0) throw new RangeError('chunk size must be positive');
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += size) {
    chunks.push(value.slice(offset, offset + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

export function joinChunks(chunks: readonly string[]): string {
  return chunks.join('');
}
