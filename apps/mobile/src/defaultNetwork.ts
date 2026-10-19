// Metro redirects the shared networks module to this file and caches that
// relative specifier by directory. Importing it here makes nativeNetworks.ts
// require itself, so TESTNET is undefined on device. The host re-exports the
// same Testnet id and Mainnet default the engine already uses.
import { DEFAULT_NETWORK_ID, TESTNET } from './nativeNetworks';

/**
 * EAS profiles for this dev app. `production` is intentionally absent:
 * a production profile keeps the core default (Mainnet).
 */
const NON_PRODUCTION_PROFILES = new Set(['dev', 'development', 'preview', 'simulator']);

export interface DefaultNetworkSignals {
  /** React Native `__DEV__`: Metro, Expo Go, and debug dev-client bundles. */
  readonly dev: boolean;
  /**
   * `EXPO_PUBLIC_LEDGERLY_BUILD_PROFILE`, inlined from eas.json for release
   * bundles where `__DEV__` is false. Not the server-only `EAS_BUILD_PROFILE`.
   */
  readonly buildProfile?: string | null;
  /** Core default used for production and any unrecognized release build. */
  readonly productionDefaultNetworkId?: string;
}

/** Testnet for dev, development, preview, and simulator. Production stays on the core default. */
export function resolveDefaultNetworkId(signals: DefaultNetworkSignals): string {
  const productionDefault = signals.productionDefaultNetworkId ?? DEFAULT_NETWORK_ID;
  const profile = signals.buildProfile?.trim().toLowerCase() ?? '';
  if (profile === 'production') return productionDefault;
  if (signals.dev || NON_PRODUCTION_PROFILES.has(profile)) return TESTNET.id;
  return productionDefault;
}

function runtimeDev(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

function runtimeBuildProfile(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const value = process.env.EXPO_PUBLIC_LEDGERLY_BUILD_PROFILE;
  return typeof value === 'string' ? value : undefined;
}

/** Default passed into the engine for this app. Saved networks are not decided here. */
export function hostDefaultNetworkId(): string {
  return resolveDefaultNetworkId({
    dev: runtimeDev(),
    buildProfile: runtimeBuildProfile(),
    productionDefaultNetworkId: DEFAULT_NETWORK_ID,
  });
}
