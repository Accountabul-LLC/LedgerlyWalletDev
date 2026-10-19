import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseRef = `origin/${process.env.BASE_REF || 'main'}`;

function gitShow(ref, file) {
  const result = spawnSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr.trim() || `Could not read ${file} from ${ref}.`);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function advisories(packageJson, lockfile) {
  const dir = mkdtempSync(join(tmpdir(), 'dep-review-'));
  try {
    writeFileSync(join(dir, 'package.json'), packageJson);
    writeFileSync(join(dir, 'package-lock.json'), lockfile);
    const result = spawnSync('npm', ['audit', '--omit=dev', '--json', '--package-lock-only'], {
      cwd: dir,
      encoding: 'utf8',
    });
    let data = {};
    try {
      data = JSON.parse(result.stdout || '{}');
    } catch {
      console.error(result.stderr);
      process.exit(1);
    }
    return Object.entries(data.vulnerabilities ?? {})
      .filter(([, vuln]) => vuln.severity === 'high' || vuln.severity === 'critical')
      .map(([name, vuln]) => `${vuln.severity} ${name}`)
      .sort();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const base = advisories(gitShow(baseRef, 'package.json'), gitShow(baseRef, 'package-lock.json'));
const head = advisories(gitShow('HEAD', 'package.json'), gitShow('HEAD', 'package-lock.json'));
const introduced = head.filter((finding) => !base.includes(finding));

console.log(`Base (${baseRef}) production advisories: ${base.length ? base.join(', ') : 'none'}`);
console.log(`Head production advisories: ${head.length ? head.join(', ') : 'none'}`);
if (introduced.length > 0) {
  console.error('This pull request introduces production advisories:');
  for (const finding of introduced) console.error(`  ${finding}`);
  process.exit(1);
}
console.log('No new high or critical production advisories.');
