/**
 * Public activity reports. No secrets and no ledger amounts.
 *
 * Dev, preview, and local builds do not send counters to LedgerlyWallet.com.
 * Reporting is off unless an endpoint is configured, or this process is the
 * production website (or a production phone release, which keeps today's
 * endpoint). An empty URL means do not send.
 */
/** Live website counter. Used only when this build is allowed to reach it. */
const LIVE_SITE_ACTIVITY_URL = 'https://ledgerlywallet.com/api/public/activity';

/** Vercel project `ledgerly` (ledgerlywallet.com). Not the ledgerly-test project. */
const LIVE_VERCEL_PROJECT_ID = 'prj_LIVE_PROJECT_ID_PLACEHOLDER';

/**
 * Production Supabase project for LedgerlyWallet.com. Compared so a
 * non-production build cannot write counters into it. This is a refusal
 * check, not a connection default.
 */
const PRODUCTION_SUPABASE_REF = 'srvzinigfedppxwypmtt';
const PRODUCTION_SUPABASE_HOST = `${PRODUCTION_SUPABASE_REF}.supabase.co`;

export type ActivityReportEnv = {
  VERCEL_ENV?: string | undefined;
  VITE_VERCEL_ENV?: string | undefined;
  VERCEL_PROJECT_ID?: string | undefined;
  VITE_VERCEL_PROJECT_ID?: string | undefined;
  VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
  VITE_VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
  VITE_ACTIVITY_URL?: string | undefined;
  EXPO_PUBLIC_ACTIVITY_URL?: string | undefined;
  ACTIVITY_URL?: string | undefined;
  EXPO_PUBLIC_LEDGERLY_BACKEND?: string | undefined;
  SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_URL?: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  EXPO_PUBLIC_SUPABASE_URL?: string | undefined;
  SUPABASE_PROJECT_ID?: string | undefined;
  VITE_SUPABASE_PROJECT_ID?: string | undefined;
};

export type ActivityReportOptions = {
  /** Overrides React Native release detection so tests stay deterministic. */
  nativeRelease?: boolean;
};

function clean(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readCurrentEnv(): ActivityReportEnv {
  if (typeof process === 'undefined' || typeof process.env === 'undefined') return {};
  return {
    VERCEL_ENV: process.env['VERCEL_ENV'],
    VITE_VERCEL_ENV: process.env['VITE_VERCEL_ENV'],
    VERCEL_PROJECT_ID: process.env['VERCEL_PROJECT_ID'],
    VITE_VERCEL_PROJECT_ID: process.env['VITE_VERCEL_PROJECT_ID'],
    VERCEL_PROJECT_PRODUCTION_URL: process.env['VERCEL_PROJECT_PRODUCTION_URL'],
    VITE_VERCEL_PROJECT_PRODUCTION_URL: process.env['VITE_VERCEL_PROJECT_PRODUCTION_URL'],
    VITE_ACTIVITY_URL: process.env['VITE_ACTIVITY_URL'],
    ACTIVITY_URL: process.env['ACTIVITY_URL'],
    SUPABASE_URL: process.env['SUPABASE_URL'],
    VITE_SUPABASE_URL: process.env['VITE_SUPABASE_URL'],
    NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'],
    SUPABASE_PROJECT_ID: process.env['SUPABASE_PROJECT_ID'],
    VITE_SUPABASE_PROJECT_ID: process.env['VITE_SUPABASE_PROJECT_ID'],
    // Member access so Expo inlines these in phone bundles.
    EXPO_PUBLIC_ACTIVITY_URL: process.env.EXPO_PUBLIC_ACTIVITY_URL,
    EXPO_PUBLIC_LEDGERLY_BACKEND: process.env.EXPO_PUBLIC_LEDGERLY_BACKEND,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  };
}

function configuredActivityUrl(env: ActivityReportEnv): string {
  return (
    clean(env.EXPO_PUBLIC_ACTIVITY_URL) || clean(env.VITE_ACTIVITY_URL) || clean(env.ACTIVITY_URL)
  );
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function isLiveActivityHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'ledgerlywallet.com' || host.endsWith('.ledgerlywallet.com');
}

/** Production website deployment. Preview, local, and ledgerly-test do not qualify. */
export function isLiveProductionDeployment(env: ActivityReportEnv): boolean {
  const vercelEnv = clean(env.VERCEL_ENV) || clean(env.VITE_VERCEL_ENV);
  if (vercelEnv !== 'production') return false;
  const projectId = clean(env.VERCEL_PROJECT_ID) || clean(env.VITE_VERCEL_PROJECT_ID);
  if (projectId === LIVE_VERCEL_PROJECT_ID) return true;
  const productionUrl =
    clean(env.VERCEL_PROJECT_PRODUCTION_URL) || clean(env.VITE_VERCEL_PROJECT_PRODUCTION_URL);
  const host = productionUrl
    ? hostnameOf(productionUrl.includes('://') ? productionUrl : `https://${productionUrl}`)
    : null;
  return host === 'ledgerlywallet.com' || host === 'www.ledgerlywallet.com';
}

function pointsAtProductionSupabase(value: string | undefined): boolean {
  const trimmed = clean(value);
  if (!trimmed) return false;
  if (trimmed === PRODUCTION_SUPABASE_REF) return true;
  const host = hostnameOf(trimmed);
  if (host === PRODUCTION_SUPABASE_HOST) return true;
  return trimmed.includes(PRODUCTION_SUPABASE_HOST);
}

/** True when this environment's Supabase coordinates are the production project. */
export function usesProductionSupabase(env: ActivityReportEnv): boolean {
  return (
    pointsAtProductionSupabase(env.SUPABASE_URL) ||
    pointsAtProductionSupabase(env.VITE_SUPABASE_URL) ||
    pointsAtProductionSupabase(env.NEXT_PUBLIC_SUPABASE_URL) ||
    pointsAtProductionSupabase(env.EXPO_PUBLIC_SUPABASE_URL) ||
    pointsAtProductionSupabase(env.SUPABASE_PROJECT_ID) ||
    pointsAtProductionSupabase(env.VITE_SUPABASE_PROJECT_ID)
  );
}

function runningInReactNative(): boolean {
  if (typeof navigator === 'undefined') return false;
  const product = (navigator as Navigator & { product?: string }).product;
  return product === 'ReactNative';
}

function metroDev(): boolean | undefined {
  if (typeof globalThis === 'undefined' || !('__DEV__' in globalThis)) return undefined;
  return Boolean((globalThis as { __DEV__?: boolean }).__DEV__);
}

function detectNativeRelease(): boolean {
  if (!runningInReactNative()) return false;
  return metroDev() !== true;
}

function nativeReleaseAllowed(env: ActivityReportEnv, options?: ActivityReportOptions): boolean {
  if (clean(env.EXPO_PUBLIC_LEDGERLY_BACKEND) === 'test') return false;
  if (options && options.nativeRelease !== undefined) return options.nativeRelease;
  return detectNativeRelease();
}

function isSafeActivityUrl(value: string): boolean {
  const host = hostnameOf(value);
  if (!host) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1');
}

/**
 * Where a public activity report may be sent. Empty means reporting is off.
 * A non-production build cannot resolve to ledgerlywallet.com.
 */
export function resolveActivityReportUrl(
  env: ActivityReportEnv,
  options?: ActivityReportOptions,
): string {
  const explicit = configuredActivityUrl(env);
  const release = nativeReleaseAllowed(env, options);
  if (explicit) {
    const host = hostnameOf(explicit);
    if (!host || !isSafeActivityUrl(explicit)) return '';
    if (isLiveActivityHost(host)) {
      return isLiveProductionDeployment(env) || release ? explicit : '';
    }
    return explicit;
  }
  if (isLiveProductionDeployment(env) || release) return LIVE_SITE_ACTIVITY_URL;
  return '';
}

/**
 * Server writes follow the same rule. The production website still records.
 * Every other build records only when its own non-production endpoint is set
 * and its Supabase project is not production.
 */
export function activityWritesAllowed(env: ActivityReportEnv): boolean {
  if (isLiveProductionDeployment(env)) return true;
  if (usesProductionSupabase(env)) return false;
  const projectId = clean(env.VERCEL_PROJECT_ID) || clean(env.VITE_VERCEL_PROJECT_ID);
  if (projectId === LIVE_VERCEL_PROJECT_ID) return false;
  const destination = resolveActivityReportUrl(env, { nativeRelease: false });
  if (!destination) return false;
  const host = hostnameOf(destination);
  return host !== null && !isLiveActivityHost(host);
}

/** Resolved for the phone reporter. Empty means the phone must not send. */
export const PRODUCTION_ACTIVITY_URL = resolveActivityReportUrl(readCurrentEnv());

export function isProductionActivityNetwork(network: string): network is 'mainnet' {
  return network === 'mainnet';
}

/** The same string the server hashes when it checks an activation. */
export function walletFingerprintMaterial(
  kind: 'wallet_created' | 'wallet_activated',
  network: string,
  address: string,
): string {
  return `${kind}:${network}:${address}`;
}

export function walletActivityBody(input: {
  kind: 'wallet_created' | 'wallet_activated';
  signerKey: string;
  fingerprint: string;
  address?: string;
}): {
  kind: 'wallet_created' | 'wallet_activated';
  network: 'mainnet';
  signerKey: string;
  fingerprint: string;
  address?: string;
} {
  return {
    kind: input.kind,
    network: 'mainnet',
    signerKey: input.signerKey,
    fingerprint: input.fingerprint,
    ...(input.kind === 'wallet_activated' && input.address ? { address: input.address } : {}),
  };
}

export function signedPaymentBody(input: { signerKey: string; txHash: string }): {
  network: 'mainnet';
  signerKey: string;
  txHash: string;
} {
  return { network: 'mainnet', signerKey: input.signerKey, txHash: input.txHash };
}
