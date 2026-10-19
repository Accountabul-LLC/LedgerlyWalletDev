/**
 * Builds the public, auditable copy of Ledgerly.
 *
 * The rule from `docs/open-source-scope.md` is: publish everything that decides
 * whether keys stay on the device, keep everything operational private. This
 * script does that by copy, from an explicit allowlist, so nothing private can
 * be pulled in by accident.
 *
 *   bun run oss:export           # write dist/oss-export/ and print the summary
 *   bun run oss:export --check   # verify only, write nothing, exit 1 on a problem
 *
 * Every run scans the copied tree for credentials and environment identifiers
 * and writes MANIFEST.sha256 so a user can diff the published repo against what
 * we shipped.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

const OUT_DIR = 'dist/oss-export';

/** Paths copied into the public repo. Directories are copied recursively. */
const INCLUDE: string[] = [
  'src/ledgerly/core',
  'src/ledgerly/web/worker.ts',
  'src/ledgerly/web/workerTransport.ts',
  'src/ledgerly/web/storage.ts',
  'extension',
  'tests/readiness/01-crypto.test.ts',
  'tests/readiness/02-keyring.test.ts',
  'tests/readiness/03-money.test.ts',
  'tests/readiness/04-addresses-networks.test.ts',
  'tests/readiness/05-vault-access.test.ts',
  'tests/readiness/11-phrase-containment.test.ts',
  'tests/readiness/12-browser-hardening.test.ts',
  'tests/readiness/12-phrase-lifecycle.test.ts',
  'tests/browser/phrase_leak.py',
  'docs/security',
  'docs/open-source-scope.md',
  'scripts/core-sync.ts',
];

/** Never copied, even if it sits under an included directory. */
const EXCLUDE_SEGMENTS = ['node_modules', '.env', '.git'];

/**
 * Anything private that must never reach the public tree. Matching is on the
 * literal file text, so this also catches a value pasted into a comment.
 */
const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: 'backend project ref', pattern: /vsaouxymljdcbbsissom|srvzinigfedppxwypmtt/i },
  { label: 'backend URL', pattern: /[a-z0-9-]+\.supabase\.(co|in)/i },
  { label: 'publishable or secret key', pattern: /\bsb_(publishable|secret)_[A-Za-z0-9_-]{8,}/ },
  { label: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ },
  { label: 'PEM private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'sync secret', pattern: /TOKEN_SYNC_SECRET\s*[:=]\s*['"][^'"]+['"]/ },
  { label: 'service role key', pattern: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+['"]/ },
  { label: 'XRPL family seed literal', pattern: /['"]s(Ed)?[1-9A-HJ-NP-Za-km-z]{27,}['"]/ },
];

/**
 * Published XRPL test vectors that look like secrets but are not. The masterpassphrase
 * seed is documented by the XRPL project itself and guards no real funds.
 */
const KNOWN_TEST_VECTORS = ['snoPBrXtMeMyMHUVTgbuqAfg1SUTb'];

/** Type-only imports the public tree makes into private product code. */
const STUBS: Record<string, string> = {
  'stubs/ledgerly-ui.d.ts': `/**
 * Interface stub. The Ledgerly product UI is not part of the public repo, so
 * the public modules that reference its transport type get this declaration
 * instead of the implementation.
 */
declare module '@ledgerly/ui' {
  export interface Transport {
    request(message: unknown): Promise<unknown>;
    subscribe(listener: (event: unknown) => void): () => void;
  }
}
`,
};

const LICENSE = `MIT License

Copyright (c) ${new Date().getUTCFullYear()} Ledgerly

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

function readme(fileCount: number): string {
  return `# Ledgerly wallet core

This is the auditable part of [Ledgerly](https://ledgerlywallet.com): the code that
decides whether your keys stay on your device and whether a transaction is the one
you approved.

It is published by copy from the product repo, from an explicit allowlist, and every
publish is a tagged commit that matches a shipped extension version.

## What is here (${fileCount} files)

| Path | What it proves |
| --- | --- |
| \`src/ledgerly/core/crypto/\` | Randomness, Argon2id parameters, AES-GCM usage, no \`Math.random\` near key material |
| \`src/ledgerly/core/vault/\` | The encrypted-at-rest vault format, header binding, lock and unlock guards |
| \`src/ledgerly/core/keyring/\` | BIP39 to secp256k1 derivation at \`m/44'/144'/index'/0/0\`, signing without export |
| \`src/ledgerly/core/xrpl/\` | Amount, address, fee and destination tag validation before signing |
| \`src/ledgerly/core/permissions/\` | Origin checks on dApp connect requests |
| \`src/ledgerly/core/engine/\` | That no signing path skips explicit user confirmation |
| \`src/ledgerly/core/storage/\`, \`rpc/\` | What is persisted, what is session only, and the message surface |
| \`src/ledgerly/web/\` | That unlocked keys live in an isolated worker, not in page scope |
| \`extension/\` | The distributed extension should be reproducible from this source |
| \`tests/\` | The same key-safety checks we run before every release |
| \`docs/security/\` | Our audit trail |

## What is not here

Backend functions, API routes, database policies, deployment and monitoring config,
analytics, and the product UI. None of those ever receive a key, a recovery phrase or
a password, and keeping the UI closed makes a pixel-perfect phishing clone harder.

See \`docs/open-source-scope.md\` for the full split and the reasoning.

## Verify a build

\`\`\`bash
sha256sum -c MANIFEST.sha256
\`\`\`

Then compare the extension you installed against a build of this tree at the matching
release tag.

## Reporting a problem

Email a security report rather than opening a public issue. Never include a recovery
phrase, private key or password in a report.
`;
}

async function walk(path: string, files: string[] = []): Promise<string[]> {
  const info = await stat(path);
  if (!info.isDirectory()) {
    files.push(path);
    return files;
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (EXCLUDE_SEGMENTS.some((seg) => entry.name === seg || entry.name.startsWith(seg))) continue;
    await walk(join(path, entry.name), files);
  }
  return files;
}

function isText(path: string): boolean {
  return !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip)$/i.test(path);
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const files: string[] = [];
  const missing: string[] = [];

  for (const entry of INCLUDE) {
    try {
      files.push(...(await walk(entry)));
    } catch {
      missing.push(entry);
    }
  }

  if (missing.length) {
    console.error('Missing allowlisted paths:');
    for (const path of missing) console.error(`  ${path}`);
    process.exit(1);
  }

  const problems: string[] = [];
  const manifest: string[] = [];
  const copies: { to: string; body: Buffer }[] = [];

  for (const path of files.sort()) {
    const body = await readFile(path);
    if (isText(path)) {
      const text = body.toString('utf8');
      const scrubbed = KNOWN_TEST_VECTORS.reduce(
        (acc, vector) => acc.split(vector).join('<known-test-vector>'),
        text,
      );
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(scrubbed)) problems.push(`${path}: ${rule.label}`);
      }
    }
    manifest.push(`${createHash('sha256').update(body).digest('hex')}  ${path}`);
    copies.push({ to: join(OUT_DIR, path), body });
  }

  if (problems.length) {
    console.error(`Refusing to export, ${problems.length} private value(s) found:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  if (checkOnly) {
    console.log(`oss-export check passed: ${files.length} files, no private values.`);
    return;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  for (const copy of copies) {
    await mkdir(dirname(copy.to), { recursive: true });
    await writeFile(copy.to, copy.body);
  }
  for (const [path, body] of Object.entries(STUBS)) {
    const to = join(OUT_DIR, path);
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, body);
    manifest.push(`${createHash('sha256').update(body).digest('hex')}  ${path}`);
  }
  await writeFile(join(OUT_DIR, 'README.md'), readme(files.length));
  await writeFile(join(OUT_DIR, 'LICENSE'), LICENSE);
  await writeFile(join(OUT_DIR, 'MANIFEST.sha256'), `${manifest.sort().join('\n')}\n`);

  const roots = new Set(files.map((path) => relative('.', path).split(sep).slice(0, 2).join('/')));
  console.log(`Exported ${files.length} files to ${OUT_DIR}`);
  for (const root of [...roots].sort()) console.log(`  ${root}`);
  console.log('Wrote README.md, LICENSE, MANIFEST.sha256 and interface stubs.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
