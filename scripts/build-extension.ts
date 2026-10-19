/**
 * Builds the Ledgerly Chrome extension (Manifest V3).
 *
 * Four bundles, three worlds:
 *   background.js - the service worker that owns the engine and the keys
 *   popup.js      - the wallet interface, an extension page
 *   content.js    - the isolated relay that lives on web pages
 *   inpage.js     - the page-world provider, untrusted by design
 *
 * Output goes to extension/dist for "Load unpacked", and public/ledgerly-extension.zip
 * for download from the web app.
 */
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const outDir = resolve(root, 'extension/dist');

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value : '';
}

async function loadEnvFile(): Promise<void> {
  try {
    const raw = await readFile(resolve(root, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (!key || process.env[key]) continue;
      process.env[key] = rawValue?.replace(/^["']|["']$/g, '') ?? '';
    }
  } catch {
    /* no .env in this environment */
  }
}

async function main() {
  await loadEnvFile();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const shared = {
    bundle: true,
    minify: true,
    sourcemap: false as const,
    target: ['chrome110'] as string[],
    tsconfig: resolve(root, 'tsconfig.json'),
    logLevel: 'info' as const,
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(readEnv('VITE_SUPABASE_URL')),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        readEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
      ),
      'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify(
        readEnv('VITE_SUPABASE_PROJECT_ID'),
      ),
    },
    alias: {
      // Website-only modules have no meaning inside an extension page.
      '@tanstack/react-start': resolve(root, 'extension/src/shims/web.tsx'),
      '@tanstack/react-router': resolve(root, 'extension/src/shims/web.tsx'),
      '@/lib/tokens.functions': resolve(root, 'extension/src/shims/tokens.ts'),
      '@/lib/metrics.functions': resolve(root, 'extension/src/shims/metrics.ts'),
    },
  };

  await build({
    ...shared,
    entryPoints: [resolve(root, 'extension/src/background.ts')],
    outfile: resolve(outDir, 'background.js'),
    format: 'esm',
    platform: 'browser',
  });

  await build({
    ...shared,
    entryPoints: [resolve(root, 'extension/src/popup.tsx')],
    outfile: resolve(outDir, 'popup.js'),
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.css': 'css' },
  });

  await build({
    ...shared,
    entryPoints: [resolve(root, 'extension/src/content.ts')],
    outfile: resolve(outDir, 'content.js'),
    format: 'iife',
    platform: 'browser',
  });

  await build({
    ...shared,
    entryPoints: [resolve(root, 'extension/src/inpage.ts')],
    outfile: resolve(outDir, 'inpage.js'),
    format: 'iife',
    platform: 'browser',
  });

  // The interface stylesheet, copied verbatim so the popup looks like the app.
  await cp(resolve(root, 'src/ledgerly/ui/styles.css'), resolve(outDir, 'popup.css'));
  await cp(resolve(root, 'extension/manifest.json'), resolve(outDir, 'manifest.json'));
  await cp(resolve(root, 'extension/popup.html'), resolve(outDir, 'popup.html'));
  await cp(resolve(root, 'extension/icon128.png'), resolve(outDir, 'icon128.png'));

  await writeFile(
    resolve(outDir, 'README.txt'),
    [
      'Ledgerly - Chrome extension (unpacked)',
      '',
      '1. Unzip this folder.',
      '2. Open chrome://extensions',
      '3. Turn on Developer mode (top right).',
      '4. Click "Load unpacked" and select this folder.',
      '',
      'Your keys are created and stored on your device only.',
    ].join('\n'),
    'utf8',
  );

  console.log('Extension built at extension/dist');
}

await main();
