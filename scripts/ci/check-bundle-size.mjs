import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_PATH = 'scripts/ci/bundle-budget.json';
const ASSETS = '.output/public/assets';

function clientGzipBytes() {
  let total = 0;
  for (const name of readdirSync(ASSETS)) {
    if (!name.endsWith('.js') && !name.endsWith('.css')) continue;
    const path = join(ASSETS, name);
    if (!statSync(path).isFile()) continue;
    total += gzipSync(readFileSync(path), { level: 9 }).length;
  }
  return total;
}

let bytes;
try {
  bytes = clientGzipBytes();
} catch {
  console.error('No client assets found at .output/public/assets. Build the web app first.');
  process.exit(1);
}

const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
const limit = budget.budgetGzipBytes;
const margin = Math.round((1 - bytes / budget.measuredGzipBytes) * -1000) / 10;
console.log(
  `Client JS+CSS gzip: ${bytes} bytes (baseline ${budget.measuredGzipBytes}, budget ${limit}).`,
);
if (bytes > limit) {
  console.error(
    `Bundle is ${bytes - limit} bytes over the budget (${margin}% vs the recorded baseline).`,
  );
  process.exit(1);
}
