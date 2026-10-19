/**
 * Fingerprints the security-sensitive code that is actually deployed.
 *
 * scripts/daily-audit.ts does the same job against the git checkout for the
 * report files committed to the repository. This module does it against the
 * running build, so the site can publish a fresh report every day without
 * waiting for a release. Same watched set, same plain-language areas.
 */

/** The code whose behaviour a person's safety actually depends on. */
const WATCHED_GLOBS = {
  ...import.meta.glob(['../routes/__root.tsx', './auth-entry.ts', './history-session.ts'], {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/core/crypto/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/core/vault/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/core/keyring/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/core/xrpl/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/core/permissions/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/core/engine/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/core/storage/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/core/rpc/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/web/worker.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/web/workerTransport.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/web/storage.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../ledgerly/ui/**/*', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('../server.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('../integrations/supabase/client.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../integrations/supabase/config.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../integrations/supabase/oauth.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../integrations/supabase/oauth-callback.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../integrations/supabase/auth-middleware.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../routes/auth.tsx', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('../routes/auth_.callback.tsx', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../routes/auth_.confirm.tsx', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../routes/reset-password.tsx', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob(
    [
      './activity-input.ts',
      './activity-record.server.ts',
      './activity-report.ts',
      '../routes/api/public/activity.ts',
    ],
    { eager: true, query: '?raw', import: 'default' },
  ),
  ...import.meta.glob('./metrics.functions.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('./ingest-guards.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('./profile.functions.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('./joey-auth.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('./joey-auth.functions.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('./email-confirmed.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('./confirm-email.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('./confirm-email.functions.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('./confirm-email.server.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('./ledger-payment.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('./security-headers.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('../../extension/manifest.json', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
  ...import.meta.glob('../../extension/src/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
} as Record<string, string>;

/** Plain-language name for a watched path, so a non-developer can follow along. */
const AREA_LABELS: { prefix: string; label: string }[] = [
  { prefix: 'src/ledgerly/core/crypto', label: 'encryption and randomness' },
  { prefix: 'src/ledgerly/core/vault', label: 'the encrypted wallet vault' },
  { prefix: 'src/ledgerly/core/keyring', label: 'key generation and signing' },
  { prefix: 'src/ledgerly/core/xrpl', label: 'transaction building and checks' },
  { prefix: 'src/ledgerly/core/permissions', label: 'app connection permissions' },
  { prefix: 'src/ledgerly/core/engine', label: 'the approval and signing flow' },
  { prefix: 'src/ledgerly/core/storage', label: 'what is stored on your device' },
  { prefix: 'src/ledgerly/core/rpc', label: 'the wallet message surface' },
  { prefix: 'src/ledgerly/web', label: 'the isolated key worker' },
  { prefix: 'src/ledgerly/ui/session', label: 'lock and sign-out handling' },
  { prefix: 'src/ledgerly/ui/cloud', label: 'profile sync' },
  { prefix: 'src/ledgerly/ui/name-memory', label: 'wallet name memory' },
  { prefix: 'src/ledgerly/ui/views', label: 'the wallet screens' },
  { prefix: 'src/ledgerly/ui', label: 'the wallet interface' },
  { prefix: 'src/lib/activity-input.ts', label: 'anonymous usage counters' },
  { prefix: 'src/lib/activity-record.server.ts', label: 'anonymous usage counters' },
  { prefix: 'src/lib/activity-report.ts', label: 'anonymous usage counters' },
  { prefix: 'src/routes/api/public/activity.ts', label: 'anonymous usage counters' },
  { prefix: 'src/lib/ingest-guards', label: 'checks on outside input' },
  { prefix: 'src/lib/profile.functions', label: 'your profile data' },
  { prefix: 'src/integrations/supabase/oauth', label: 'Google sign-in' },
  { prefix: 'src/routes/auth_.callback', label: 'Google sign-in' },
  { prefix: 'src/lib/joey-auth', label: 'Joey sign-in' },
  { prefix: 'src/lib/email-confirmed', label: 'email confirmation' },
  { prefix: 'src/lib/confirm-email', label: 'email confirmation' },
  { prefix: 'src/routes/auth_.confirm', label: 'email confirmation' },
  { prefix: 'src/lib/ledger-payment', label: 'ledger payment checks' },
  { prefix: 'src/lib/security-headers', label: 'browser security headers' },
  { prefix: 'src/server.ts', label: 'browser security headers' },
  { prefix: 'src/lib/metrics.functions.ts', label: 'anonymous usage counters' },
  { prefix: 'extension', label: 'the browser extension' },
];

export function areaFor(path: string): string {
  return AREA_LABELS.find((entry) => path.startsWith(entry.prefix))?.label ?? 'wallet code';
}

/** Turns a glob key such as "../ledgerly/core/vault/vault.ts" into a repo path. */
function repoPath(key: string): string {
  if (key.startsWith('../../')) return key.slice(6);
  if (key.startsWith('../')) return `src/${key.slice(3)}`;
  if (key.startsWith('./')) return `src/lib/${key.slice(2)}`;
  return key;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text.replace(/\r\n/g, '\n')),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** path -> sha256 of the file contents shipped in this build. */
export async function deployedManifest(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const [key, source] of Object.entries(WATCHED_GLOBS)) {
    if (typeof source !== 'string') continue;
    if (key.endsWith('.css')) continue;
    files[repoPath(key)] = await sha256(source);
  }
  return files;
}
