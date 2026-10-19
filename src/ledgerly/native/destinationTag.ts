/** Preserve optional uint32 tags; reject pasted signs, decimals and exponents. */
export function parseDestinationTag(input: string): number | undefined {
  const value = input.trim();
  if (!value) return undefined;
  const tag = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(tag) || tag > 0xffffffff) {
    throw new Error('Destination tags must be whole numbers from 0 to 4294967295.');
  }
  return tag;
}
