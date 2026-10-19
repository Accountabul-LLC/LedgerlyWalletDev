import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('mobile/package.json') || !existsSync('mobile/tsconfig.json')) {
  console.log('SKIP mobile typecheck: mobile/ is not in this checkout.');
  process.exit(0);
}

const install = spawnSync('npm', ['ci', '--prefix', 'mobile'], { stdio: 'inherit' });
if (install.status !== 0) process.exit(install.status ?? 1);

const check = spawnSync('npm', ['run', 'typecheck', '--prefix', 'mobile'], { stdio: 'inherit' });
process.exit(check.status ?? 1);
