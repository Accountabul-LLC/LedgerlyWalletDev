/**
 * Daily code report for the Ledgerly security center.
 *
 * Runs once a day (see .github/workflows/daily-audit.yml) and answers one
 * question in plain language: did anything change in the code that protects
 * people's keys? It hashes every security-sensitive file, diffs that against
 * yesterday's manifest, and writes a dated report plus a small index. The
 * README never grows; the history does.
 *
 *   bun run audit:daily            # write today's report (scheduled main job only)
 *   bun run audit:daily --check    # print what today's report would say
 *
 * CI, manual dispatches and feature branches always take the check path.
 * The diff baseline is the manifest last published on main, not a copy a
 * branch may have edited locally.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { changeCounts, cumulativeChanges, reportText } from '../src/lib/daily-report-changes.ts';
import { reportCalendarDay } from '../src/lib/report-calendar.ts';
import { canWriteRepositoryReport } from '../src/lib/report-publish.ts';

const execFileAsync = promisify(execFile);

const REPORTS_DIR = 'docs/security/reports';
const MANIFEST_PATH = join(REPORTS_DIR, 'manifest.json');
const INDEX_PATH = join(REPORTS_DIR, 'index.json');

/** The code whose behaviour a user's safety actually depends on. */
const WATCHED = [
  'src/ledgerly/core/crypto',
  'src/ledgerly/core/vault',
  'src/ledgerly/core/keyring',
  'src/ledgerly/core/xrpl',
  'src/ledgerly/core/permissions',
  'src/ledgerly/core/engine',
  'src/ledgerly/core/storage',
  'src/ledgerly/core/rpc',
  'src/ledgerly/web/worker.ts',
  'src/ledgerly/web/workerTransport.ts',
  'src/ledgerly/web/storage.ts',
  'src/ledgerly/ui',
  'src/server.ts',
  'src/integrations/supabase/client.ts',
  'src/integrations/supabase/config.ts',
  'src/integrations/supabase/oauth.ts',
  'src/integrations/supabase/oauth-callback.ts',
  'src/integrations/supabase/auth-middleware.ts',
  'src/routes/auth.tsx',
  'src/routes/__root.tsx',
  'src/lib/auth-entry.ts',
  'src/lib/history-session.ts',
  'src/routes/auth_.callback.tsx',
  'src/routes/auth_.confirm.tsx',
  'src/routes/reset-password.tsx',
  'src/lib/activity-input.ts',
  'src/lib/activity-record.server.ts',
  'src/lib/activity-report.ts',
  'src/routes/api/public/activity.ts',
  'src/lib/metrics.functions.ts',
  'src/lib/ingest-guards.ts',
  'src/lib/profile.functions.ts',
  'src/lib/joey-auth.ts',
  'src/lib/joey-auth.functions.ts',
  'src/lib/email-confirmed.ts',
  'src/lib/confirm-email.ts',
  'src/lib/confirm-email.functions.ts',
  'src/lib/confirm-email.server.ts',
  'src/lib/ledger-payment.ts',
  'src/lib/security-headers.ts',
  'extension/manifest.json',
  'extension/src',
];

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

export type DailyReport = {
  date: string;
  generatedAt: string;
  status: 'unchanged' | 'changed' | 'baseline';
  headline: string;
  summary: string;
  filesWatched: number;
  changes: { path: string; kind: 'added' | 'modified' | 'removed' | 'now watched'; area: string }[];
  areas: string[];
  fullAudit: string;
};

type Manifest = { date: string; files: Record<string, string> };
type IndexEntry = Pick<DailyReport, 'date' | 'status' | 'headline'> & { file: string };

function areaFor(path: string): string {
  return AREA_LABELS.find((entry) => path.startsWith(entry.prefix))?.label ?? 'wallet code';
}

async function walk(path: string, files: string[] = []): Promise<string[]> {
  let info;
  try {
    info = await stat(path);
  } catch {
    return files;
  }
  if (!info.isDirectory()) {
    // Stylesheets are presentation, not protection, and bundlers rewrite them.
    if (!path.endsWith('.css')) files.push(path);
    return files;
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    await walk(join(path, entry.name), files);
  }
  return files;
}

async function currentManifest(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of WATCHED) {
    for (const path of await walk(entry)) {
      files[path.replace(/\\/g, '/')] = createHash('sha256')
        .update((await readFile(path, 'utf8')).replace(/\r\n/g, '\n'))
        .digest('hex');
    }
  }
  return files;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function latestFullAudit(): Promise<string> {
  const entries = (await readdir('docs/security')).filter((name) => name.endsWith('.md')).sort();
  return entries.at(-1) ?? '';
}

function changeTable(changes: DailyReport['changes']): string {
  return changes
    .map((change) => `| \`${change.path}\` | ${change.kind} | ${change.area} |`)
    .join('\n');
}

function markdown(report: DailyReport): string {
  const counts = changeCounts(report.changes);
  const modified = report.changes.filter((change) => change.kind !== 'now watched');
  const watched = report.changes.filter((change) => change.kind === 'now watched');
  const table = (changes: DailyReport['changes']) =>
    changes.length
      ? `| File | Change | Area |
| --- | --- | --- |
${changeTable(changes)}
`
      : '';
  return `# Daily code report - ${report.date}

**${report.headline || 'No protected file changed.'}**

${report.summary}

- Files watched: ${report.filesWatched}
- Changes since the previous report: ${counts.modified}
- Newly watched: ${counts.newlyWatched}
- Latest full audit: [${report.fullAudit}](../${report.fullAudit})
- Generated at: ${report.generatedAt} (America/Chicago calendar day ${report.date})

## What changed

${modified.length ? table(modified) : 'Nothing.\n'}
## Newly watched

${watched.length ? `${table(watched)}\nThese files joined the daily watch list. They are not counted as changes to code that was already watched.\n` : 'Nothing.\n'}
## What this report is

An automated diff of the code that decides whether keys stay on your device.
It is not a substitute for the full audit, and it does not claim the absence of
bugs. It tells you, every day, whether the protective code moved.
`;
}

async function gitShow(ref: string, path: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' });
    return stdout;
  } catch {
    return null;
  }
}

/** Same-day evidence already published on main, not a branch-local report. */
async function publishedSameDay(date: string): Promise<DailyReport | null> {
  const path = join(REPORTS_DIR, `${date}.json`);
  if (canWriteRepositoryReport()) return readJson<DailyReport>(path);
  for (const ref of ['origin/main', 'main']) {
    const text = await gitShow(ref, path);
    if (text) return JSON.parse(text) as DailyReport;
  }
  return null;
}

/** The fingerprint last published on main, not this branch's working copy. */
async function publishedManifest(): Promise<Manifest | null> {
  if (canWriteRepositoryReport()) return readJson<Manifest>(MANIFEST_PATH);
  for (const ref of ['origin/main', 'main']) {
    const text = await gitShow(ref, MANIFEST_PATH);
    if (text) return JSON.parse(text) as Manifest;
  }
  return readJson<Manifest>(MANIFEST_PATH);
}

async function main() {
  const checkOnly = !canWriteRepositoryReport();
  const date = reportCalendarDay();
  const files = await currentManifest();
  const previous = await publishedManifest();

  let changes: DailyReport['changes'] = [];
  if (previous) {
    for (const [path, hash] of Object.entries(files)) {
      const before = previous.files[path];
      if (before === undefined) {
        // A path we did not fingerprint before is newly watched, not newly written.
        changes.push({ path, kind: 'now watched', area: areaFor(path) });
      } else if (before !== hash) changes.push({ path, kind: 'modified', area: areaFor(path) });
    }
    for (const path of Object.keys(previous.files)) {
      if (!(path in files)) changes.push({ path, kind: 'removed', area: areaFor(path) });
    }
  }
  changes = cumulativeChanges(date, await publishedSameDay(date), changes);

  const modified = changes.filter((change) => change.kind !== 'now watched');
  const areas = [...new Set((modified.length ? modified : changes).map((change) => change.area))];
  const status: DailyReport['status'] = !previous
    ? 'baseline'
    : changes.length
      ? 'changed'
      : 'unchanged';

  const report: DailyReport = {
    date,
    generatedAt: new Date().toISOString(),
    status,
    ...reportText(status, changes, areas),
    filesWatched: Object.keys(files).length,
    changes,
    areas,
    fullAudit: await latestFullAudit(),
  };

  if (checkOnly) {
    console.log(`${report.headline}\n${report.summary}`);
    console.log('Check only. No files under docs/security/reports were written.');
    return;
  }

  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(join(REPORTS_DIR, `${date}.json`), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(REPORTS_DIR, `${date}.md`), markdown(report));
  await writeFile(MANIFEST_PATH, `${JSON.stringify({ date, files }, null, 2)}\n`);

  const index = (await readJson<IndexEntry[]>(INDEX_PATH)) ?? [];
  const entry: IndexEntry = {
    date,
    status: report.status,
    headline: report.headline,
    file: `${date}.md`,
  };
  const merged = [entry, ...index.filter((item) => item.date !== date)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 180);
  await writeFile(INDEX_PATH, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(`${date}: ${report.headline} (${report.filesWatched} files watched)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
