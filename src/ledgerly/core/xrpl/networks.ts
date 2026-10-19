export interface NetworkConfig {
  readonly id: string;
  readonly label: string;
  /** WebSocket endpoint. Only `wss:` is accepted; see `assertSecureEndpoint`. */
  readonly endpoint: string;
  /**
   * Expected `NetworkID`. The engine refuses to sign when the connected server
   * reports something else, which is what stops a transaction prepared for a
   * test network from being replayed on Mainnet.
   */
  readonly networkId: number;
  readonly isTest: boolean;
  readonly explorerTx: string;
  readonly explorerAccount: string;
  readonly faucet?: string;
  /**
   * Extra `wss:` URLs tried, in order, when `endpoint` cannot be reached.
   * Used for Testnet so a network that blocks port 51233 can still connect
   * over 443. Mainnet does not use this.
   */
  readonly fallbackEndpoints?: readonly string[];
}

export const MAINNET: NetworkConfig = {
  id: 'mainnet',
  label: 'Mainnet',
  endpoint: 'wss://xrplcluster.com',
  networkId: 0,
  isTest: false,
  explorerTx: 'https://livenet.xrpl.org/transactions/',
  explorerAccount: 'https://livenet.xrpl.org/accounts/',
};

export const TESTNET: NetworkConfig = {
  id: 'testnet',
  label: 'Testnet',
  endpoint: 'wss://s.altnet.rippletest.net:51233',
  // Same Testnet, on port 443, for networks that block 51233.
  fallbackEndpoints: ['wss://testnet.xrpl-labs.com'],
  networkId: 1,
  isTest: true,
  explorerTx: 'https://testnet.xrpl.org/transactions/',
  explorerAccount: 'https://testnet.xrpl.org/accounts/',
  faucet: 'https://faucet.altnet.rippletest.net/accounts',
};

export const DEVNET: NetworkConfig = {
  id: 'devnet',
  label: 'Devnet',
  endpoint: 'wss://s.devnet.rippletest.net:51233',
  networkId: 2,
  isTest: true,
  explorerTx: 'https://devnet.xrpl.org/transactions/',
  explorerAccount: 'https://devnet.xrpl.org/accounts/',
  faucet: 'https://faucet.devnet.rippletest.net/accounts',
};

export const BUILT_IN_NETWORKS: readonly NetworkConfig[] = [MAINNET, TESTNET, DEVNET];

export const DEFAULT_NETWORK_ID = MAINNET.id;

/**
 * Network selected at startup.
 *
 * A saved id is the user's choice and is kept. When nothing is saved, a host
 * may pass the build's default; otherwise the result is Mainnet.
 */
export function initialNetworkId(
  storedNetworkId: unknown,
  hostDefaultNetworkId?: string | null,
): string {
  if (typeof storedNetworkId === 'string' && storedNetworkId.trim() !== '') {
    return storedNetworkId;
  }
  if (typeof hostDefaultNetworkId === 'string' && hostDefaultNetworkId.trim() !== '') {
    return hostDefaultNetworkId.trim();
  }
  return DEFAULT_NETWORK_ID;
}

export function findNetwork(
  networks: readonly NetworkConfig[],
  id: string,
): NetworkConfig | undefined {
  return networks.find((network) => network.id === id);
}

/**
 * Plain `ws:` would expose account queries and signed blobs to anyone on the
 * path, and xrpl.js will not send credentials over it either. Custom endpoints
 * are a supported feature, so this check runs on user input.
 */
export function assertSecureEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('That does not look like a valid URL.');
  }
  if (url.protocol !== 'wss:') {
    throw new Error('Only wss:// endpoints are allowed.');
  }
}

export function validateCustomNetwork(input: {
  label: string;
  endpoint: string;
  networkId: number;
}): NetworkConfig {
  const label = input.label.trim();
  if (label.length === 0 || label.length > 40) {
    throw new Error('Give the network a name between 1 and 40 characters.');
  }
  assertSecureEndpoint(input.endpoint);
  if (!Number.isInteger(input.networkId) || input.networkId < 0 || input.networkId > 0xffffffff) {
    throw new Error('Network ID must be a 32-bit unsigned integer.');
  }
  return {
    id: `custom:${input.endpoint}`,
    label,
    endpoint: input.endpoint,
    networkId: input.networkId,
    isTest: true,
    explorerTx: '',
    explorerAccount: '',
  };
}
