import { describe, expect, it } from 'vitest';
import {
  MAX_DESTINATION_TAG,
  assertDestinationTag,
  isValidAddress,
  resolveDestination,
  shortenAddress,
  toXAddress,
} from '@/ledgerly/core/xrpl/address';
import {
  BUILT_IN_NETWORKS,
  DEFAULT_NETWORK_ID,
  MAINNET,
  TESTNET,
  assertSecureEndpoint,
  findNetwork,
  validateCustomNetwork,
} from '@/ledgerly/core/xrpl/networks';

const CLASSIC = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

describe('readiness: addresses and networks', () => {
  it('T31 classic addresses validate, checksum errors are rejected', () => {
    expect(isValidAddress(CLASSIC)).toBe(true);
    expect(isValidAddress(`${CLASSIC.slice(0, -1)}X`)).toBe(false);
    expect(isValidAddress('')).toBe(false);
    expect(isValidAddress('0xdeadbeef')).toBe(false);
  });

  it('T32 X-addresses resolve to the classic address and bind their tag', () => {
    const xAddress = toXAddress(CLASSIC, 42, false);
    const resolved = resolveDestination(xAddress);
    expect(resolved.address).toBe(CLASSIC);
    expect(resolved.destinationTag).toBe(42);
    expect(resolved.tagIsBound).toBe(true);
  });

  it('T33 test-network X-addresses are flagged', () => {
    expect(resolveDestination(toXAddress(CLASSIC, false, true)).isTestAddress).toBe(true);
    expect(resolveDestination(toXAddress(CLASSIC, false, false)).isTestAddress).toBe(false);
  });

  it('T34 destination tags are range checked', () => {
    expect(() => assertDestinationTag(0)).not.toThrow();
    expect(() => assertDestinationTag(MAX_DESTINATION_TAG)).not.toThrow();
    expect(() => assertDestinationTag(undefined)).not.toThrow();
    expect(() => assertDestinationTag(-1)).toThrow();
    expect(() => assertDestinationTag(MAX_DESTINATION_TAG + 1)).toThrow();
    expect(() => assertDestinationTag(1.5)).toThrow();
  });

  it('T35 shortened addresses keep both ends intact', () => {
    const short = shortenAddress(CLASSIC);
    expect(short.startsWith(CLASSIC.slice(0, 6))).toBe(true);
    expect(short.endsWith(CLASSIC.slice(-4))).toBe(true);
    expect(short.length).toBeLessThan(CLASSIC.length);
  });

  it('T36 fuzz: destination resolution rejects junk without crashing', () => {
    const alphabet = 'rXT0OIl+/=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let accepted = 0;
    for (let i = 0; i < 2_000; i += 1) {
      const length = 1 + Math.floor(Math.random() * 40);
      let input = '';
      for (let j = 0; j < length; j += 1)
        input += alphabet[Math.floor(Math.random() * alphabet.length)];
      try {
        const resolved = resolveDestination(input);
        accepted += 1;
        expect(isValidAddress(resolved.address)).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }
    expect(accepted).toBe(0);
  });

  it('T37 built-in networks are well formed and mainnet is the default', () => {
    expect(DEFAULT_NETWORK_ID).toBe(MAINNET.id);
    expect(MAINNET.isTest).toBeFalsy();
    expect(TESTNET.isTest).toBe(true);
    for (const network of BUILT_IN_NETWORKS) {
      expect(network.id).toBeTruthy();
      expect(network.endpoint.startsWith('wss://')).toBe(true);
    }
    expect(findNetwork(BUILT_IN_NETWORKS, MAINNET.id)?.id).toBe(MAINNET.id);
    expect(findNetwork(BUILT_IN_NETWORKS, 'nope')).toBeUndefined();
    expect(MAINNET.endpoint).toBe('wss://xrplcluster.com');
    expect(MAINNET.fallbackEndpoints).toBeUndefined();
    expect(TESTNET.endpoint).toBe('wss://s.altnet.rippletest.net:51233');
    expect(TESTNET.fallbackEndpoints).toEqual(['wss://testnet.xrpl-labs.com']);
    for (const endpoint of TESTNET.fallbackEndpoints ?? []) {
      expect(endpoint.startsWith('wss://')).toBe(true);
      expect(endpoint.includes(':51233')).toBe(false);
    }
  });

  it('T38 insecure or malformed endpoints are refused', () => {
    expect(() => assertSecureEndpoint('wss://xrplcluster.com')).not.toThrow();
    expect(() => assertSecureEndpoint('ws://xrplcluster.com')).toThrow();
    expect(() => assertSecureEndpoint('http://xrplcluster.com')).toThrow();
    expect(() => assertSecureEndpoint('not a url')).toThrow();
    expect(() =>
      validateCustomNetwork({ label: '', endpoint: 'wss://x.example', networkId: 1 }),
    ).toThrow();
    expect(() =>
      validateCustomNetwork({ label: 'Custom', endpoint: 'ws://x.example', networkId: 1 }),
    ).toThrow();
    expect(() =>
      validateCustomNetwork({ label: 'Custom', endpoint: 'wss://x.example', networkId: -1 }),
    ).toThrow();
    expect(
      validateCustomNetwork({ label: 'Custom', endpoint: 'wss://x.example', networkId: 5 }).isTest,
    ).toBe(true);
  });
});
