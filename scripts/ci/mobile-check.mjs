import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('mobile/package.json')) {
  console.log('SKIP mobile: mobile/package.json is not in this checkout.');
  process.exit(0);
}

function run(args) {
  const result = spawnSync('npx', args, { cwd: 'mobile', stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync('mobile/node_modules/expo')) {
  const install = spawnSync('npm', ['ci', '--prefix', 'mobile'], { stdio: 'inherit' });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

run(['expo', 'config', '--type', 'public']);
run(['expo-doctor']);
