import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const required = process.argv.includes('--require');

function sqlMigrations() {
  if (!existsSync('supabase/migrations')) return [];
  return readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql'));
}

function installed(command) {
  const result = spawnSync('bash', ['-lc', `command -v ${command}`], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const migrations = sqlMigrations();
if (migrations.length === 0) {
  console.log('SKIP database: supabase/migrations has no SQL files.');
  process.exit(0);
}

if (!installed('docker') || !installed('supabase')) {
  const message = 'Database checks need Docker and the Supabase CLI.';
  if (required) {
    console.error(message);
    process.exit(1);
  }
  console.log(`SKIP database: ${message} CI runs them with --require.`);
  process.exit(0);
}

let started = false;
try {
  run('supabase', ['db', 'start']);
  started = true;

  const listed = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  const container = listed.stdout
    .split('\n')
    .map((name) => name.trim())
    .find((name) => /^supabase_db_[A-Za-z0-9_-]+$/.test(name));
  if (!container) {
    console.error('supabase db start did not leave a supabase_db container running.');
    process.exit(1);
  }

  const rls = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: readFileSync('scripts/ci/check-rls.sql'), stdio: ['pipe', 'inherit', 'inherit'] },
  );
  if (rls.status !== 0) process.exit(rls.status ?? 1);

  run('supabase', [
    'db',
    'lint',
    '--local',
    '--schema',
    'public',
    '--level',
    'warning',
    '--fail-on',
    'error',
  ]);
  run('supabase', ['test', 'db', '--local']);
} finally {
  if (started) spawnSync('supabase', ['stop', '--no-backup'], { stdio: 'inherit' });
}
