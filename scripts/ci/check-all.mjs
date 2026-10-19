import { spawnSync } from 'node:child_process';

const steps = [
  ['Typecheck', 'npm', ['run', 'typecheck']],
  ['Mobile typecheck', 'node', ['scripts/ci/typecheck-mobile.mjs']],
  ['Lint', 'npm', ['run', 'lint']],
  ['Format', 'npm', ['run', 'format:check']],
  ['Unit tests', 'npm', ['run', 'test:coverage']],
  ['XRPL benches', 'npm', ['run', 'test:bench']],
  ['Production audit', 'npm', ['run', 'audit:prod']],
  ['Web build', 'npm', ['run', 'build']],
  ['Client bundle secrets', 'node', ['scripts/ci/check-client-secrets.mjs']],
  ['Bundle size', 'node', ['scripts/ci/check-bundle-size.mjs']],
  ['Mobile', 'node', ['scripts/ci/mobile-check.mjs']],
  ['Database', 'node', ['scripts/ci/check-db.mjs']],
];

if (spawnSync('bash', ['-lc', 'command -v gitleaks'], { encoding: 'utf8' }).status === 0) {
  steps.push([
    'Secret scan',
    'gitleaks',
    ['detect', '--source', '.', '--config', '.gitleaks.toml', '--redact', '--exit-code', '1'],
  ]);
} else {
  console.log('SKIP secret scan: gitleaks is not installed. CI runs it on every pull request.');
}

const buildEnv = {
  ...process.env,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY:
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ci_not_a_secret',
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:
    process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ci_not_a_secret',
};

const results = [];
for (const [name, command, args] of steps) {
  console.log(`\n── ${name} ──`);
  const started = Date.now();
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: name === 'Web build' ? buildEnv : process.env,
  });
  const ok = result.status === 0;
  results.push({ name, ok, seconds: ((Date.now() - started) / 1000).toFixed(1) });
}

console.log('\n── check:all ──');
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} (${result.seconds}s)`);
}
if (results.some((result) => !result.ok)) process.exit(1);
console.log(
  'Local checks passed. CodeQL, dependency review, and Lighthouse run in GitHub Actions.',
);
