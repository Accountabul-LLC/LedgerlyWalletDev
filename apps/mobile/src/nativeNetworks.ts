import {
  MAINNET as upstreamMainnet,
  TESTNET,
  DEVNET,
  type NetworkConfig,
} from '../../../src/ledgerly/core/xrpl/networks';

export * from '../../../src/ledgerly/core/xrpl/networks';

// The development host uses the documented public full-history server. The
// upstream endpoint rejects Android's native WebSocket handshake with HTTP 418.
// Keep the chain identity and all verification rules unchanged.
export const MAINNET: NetworkConfig = {
  ...upstreamMainnet,
  endpoint: 'wss://s2.ripple.com',
};
export const BUILT_IN_NETWORKS: readonly NetworkConfig[] = [MAINNET, TESTNET, DEVNET];
