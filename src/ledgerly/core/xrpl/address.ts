import {
  classicAddressToXAddress,
  isValidClassicAddress,
  isValidXAddress,
  xAddressToClassicAddress,
} from 'ripple-address-codec';

export const MAX_DESTINATION_TAG = 0xffffffff;

export interface ResolvedDestination {
  readonly address: string;
  readonly destinationTag?: number;
  /** True when the tag came from an X-address and must not be overridden. */
  readonly tagIsBound: boolean;
  readonly isTestAddress: boolean;
}

/**
 * Accepts either address form and normalises to a classic address plus tag.
 *
 * Both encodings are base58 with a checksum, so a mistyped character is
 * rejected here rather than sending funds into the void. X-addresses carry the
 * destination tag inside the checksum, which is why a tag they supply is
 * treated as fixed: silently replacing it is how exchange deposits get lost.
 */
export function resolveDestination(input: string): ResolvedDestination {
  const value = input.trim();
  if (value.length === 0) {
    throw new Error('Enter a destination address.');
  }

  if (isValidXAddress(value)) {
    const { classicAddress, tag, test } = xAddressToClassicAddress(value);
    return {
      address: classicAddress,
      ...(tag === false ? {} : { destinationTag: tag }),
      tagIsBound: true,
      isTestAddress: test,
    };
  }

  if (isValidClassicAddress(value)) {
    return { address: value, tagIsBound: false, isTestAddress: false };
  }

  throw new Error('That is not a valid XRP Ledger address.');
}

export function isValidAddress(value: string): boolean {
  const trimmed = value.trim();
  return isValidClassicAddress(trimmed) || isValidXAddress(trimmed);
}

export function toXAddress(address: string, tag: number | false, isTest: boolean): string {
  return classicAddressToXAddress(address, tag, isTest);
}

export function assertDestinationTag(tag: number | undefined): void {
  if (tag === undefined) return;
  if (!Number.isInteger(tag) || tag < 0 || tag > MAX_DESTINATION_TAG) {
    throw new Error('Destination tag must be a whole number between 0 and 4294967295.');
  }
}

/** `rXXXX…YYYY`, for lists where the full address will not fit. */
export function shortenAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
