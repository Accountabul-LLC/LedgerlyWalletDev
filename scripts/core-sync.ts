/**
 * Keeps `src/ledgerly/core/` in sync with the upstream wallet repo.
 *
 * Upstream lives at the repo named by CORE_UPSTREAM_REPO (owner/xrpl-browser-wallet) under `packages/core/src`.
 * This project vendors that folder (no git submodule, because Lovable's GitHub
 * sync pushes a single flat tree). So the sync is an explicit, reviewable step
 * rather than something that silently rewrites engine code underneath you.
 *
 *   bun run scripts/core-sync.ts check   # report drift, exit 1 if any
 *   bun run scripts/core-sync.ts pull    # overwrite local files with upstream
 *
 * `pull` never touches files listed in LOCAL_FORKS: those carry Ledgerly-only
 * changes and must be merged by hand.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const REPO = process.env.CORE_UPSTREAM_REPO ?? 'UPSTREAM_OWNER/xrpl-browser-wallet';
const UPSTREAM_ROOT = 'packages/core/src/';
const LOCAL_ROOT = 'src/ledgerly/core';
const PIN_FILE = 'src/ledgerly/core/UPSTREAM.json';

/** Files we have deliberately diverged on. `pull` skips them and only reports. */
const LOCAL_FORKS = new Set([
  'vault/schema.ts',
  'engine/engine.ts',
  'rpc/protocol.ts',
  'keyring/derive.ts',
  'keyring/keyring.ts',
  'shared.ts',
  'xrpl/connection.ts',
]);

/**
 * Upstream is a Node ESM package and writes `./random.js`; this app is bundled
 * by Vite and uses extensionless relative imports. That rewrite is mechanical,
 * so normalise it away instead of reporting every file as drifted.
 */
function normalise(source: string): string {
  return source
    .replace(/(from\s+'\.{1,2}\/[^']*)\.js'/g, "$1'")
    .replace(/\r\n/g, '\n')
    .trimEnd();
}

function digest(source: string): string {
  return createHash('sha1').update(normalise(source)).digest('hex');
}

async function upstreamTree(ref: string): Promise<{ commit: string; paths: string[] }> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  const token = process.env['GITHUB_TOKEN'];
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const commitRes = await fetch(`https://api.github.com/repos/${REPO}/commits/${ref}`, { headers });
  if (!commitRes.ok) throw new Error(`GitHub ${commitRes.status}: ${await commitRes.text()}`);
  const commit = ((await commitRes.json()) as { sha: string }).sha;

  const treeRes = await fetch(
    `https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`,
    { headers },
  );
  if (!treeRes.ok) throw new Error(`GitHub ${treeRes.status}: ${await treeRes.text()}`);
  const tree = (await treeRes.json()) as { tree: { path: string; type: string; sha: string }[] };

  const paths = tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(UPSTREAM_ROOT))
    .map((entry) => entry.path.slice(UPSTREAM_ROOT.length))
    .filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'));

  return { commit, paths };
}

async function localFiles(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
      out.set(relative(LOCAL_ROOT, full), digest(await readFile(full, 'utf8')));
    }
  }
  await walk(LOCAL_ROOT);
  return out;
}

async function fetchBlob(commit: string, path: string): Promise<string> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${REPO}/${commit}/${UPSTREAM_ROOT}${path}`,
  );
  if (!res.ok) throw new Error(`Could not download ${path}: ${res.status}`);
  return res.text();
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'check';
  if (mode !== 'check' && mode !== 'pull') {
    console.error('Usage: bun run scripts/core-sync.ts [check|pull]');
    process.exit(2);
  }

  const { commit, paths } = await upstreamTree(process.env['UPSTREAM_REF'] ?? 'HEAD');
  const local = await localFiles();
  const upstream = new Map<string, string>();
  await Promise.all(paths.map(async (path) => upstream.set(path, await fetchBlob(commit, path))));

  const changed: string[] = [];
  const added: string[] = [];
  const forked: string[] = [];

  for (const [path, source] of upstream) {
    const mine = local.get(path);
    if (mine === undefined) {
      added.push(path);
    } else if (mine !== digest(source)) {
      if (LOCAL_FORKS.has(path)) forked.push(path);
      else changed.push(path);
    }
    local.delete(path);
  }
  const localOnly = [...local.keys()];

  console.log(`upstream ${REPO}@${commit.slice(0, 7)}`);
  const report = (label: string, list: string[]) => {
    if (list.length === 0) return;
    console.log(`\n${label} (${list.length})`);
    for (const path of list.sort()) console.log(`  ${path}`);
  };
  report('changed upstream', changed);
  report('new upstream', added);
  report('intentional local forks, review by hand', forked);
  report('local only, not in upstream', localOnly);

  if (mode === 'check') {
    if (changed.length + added.length === 0) {
      console.log('\nIn sync. Forked files are expected and are not drift.');
      return;
    }
    process.exit(1);
  }

  for (const path of [...changed, ...added]) {
    const target = join(LOCAL_ROOT, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${normalise(upstream.get(path)!)}\n`);
    console.log(`pulled ${path}`);
  }

  await writeFile(
    PIN_FILE,
    `${JSON.stringify(
      { repo: REPO, path: UPSTREAM_ROOT, commit, pulledAt: new Date().toISOString() },
      null,
      2,
    )}\n`,
  );
  console.log(`\nPinned to ${commit.slice(0, 7)}. Review the diff before committing.`);
  if (forked.length > 0) {
    console.log('Forked files were left alone. Merge those changes yourself.');
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
