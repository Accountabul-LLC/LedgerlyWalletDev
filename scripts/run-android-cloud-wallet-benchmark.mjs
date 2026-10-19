import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

assert(
  process.env.LEDGERLY_TEST_PRIVATE_DIR && process.env.LEDGERLY_TEST_REPORT,
  'Set LEDGERLY_TEST_PRIVATE_DIR outside Git and LEDGERLY_TEST_REPORT for public results.',
);
assert(process.env.HTTPS_PROXY, 'This cloud runner requires the inherited session HTTPS proxy.');
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const mobileRequire = createRequire(new URL('../mobile/package.json', import.meta.url));
const xrpl = pathToFileURL(require.resolve('xrpl')).href;
const proxyAgent = pathToFileURL(mobileRequire.resolve('https-proxy-agent')).href;
const tempRoot = path.join(root, '.codex-temp');
await mkdir(tempRoot, { recursive: true });
const temp = await mkdtemp(path.join(tempRoot, 'cloud-wallet-'));
const wrapper = path.join(temp, 'xrpl-proxy.mjs');
const bundle = path.join(temp, 'benchmark.mjs');
// Test-only SDK adapter: preserve chain checks, TLS, signing, and vault code.
await writeFile(
  wrapper,
  `
import { Client as BaseClient } from ${JSON.stringify(xrpl)};
import { HttpsProxyAgent } from ${JSON.stringify(proxyAgent)};
export * from ${JSON.stringify(xrpl)};
export class Client extends BaseClient {
  constructor(url, options = {}) {
    super(url, { ...options, agent: new HttpsProxyAgent(process.env.HTTPS_PROXY) });
  }
}
`,
);
await build({
  entryPoints: [path.join(root, 'scripts/android-cloud-wallet-benchmark.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  plugins: [
    {
      name: 'session-proxy-for-integration-only',
      setup(builder) {
        builder.onResolve({ filter: /^xrpl$/ }, (args) =>
          args.importer.includes('/src/ledgerly/core/') ? { path: wrapper } : undefined,
        );
        builder.onResolve({ filter: /^file:/ }, (args) => ({ path: args.path, external: true }));
      },
    },
  ],
});
const child = spawn(process.execPath, [bundle], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
});
child.on('error', (error) => {
  throw error;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
