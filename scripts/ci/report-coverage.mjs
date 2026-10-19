import { appendFileSync, readFileSync } from 'node:fs';

function read(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

const summary = read('coverage/coverage-summary.json');
const baseline = read('scripts/ci/coverage-baseline.json');
if (!summary?.total) {
  console.log('No coverage summary was produced.');
  process.exit(0);
}

const total = summary.total;
const lines = ['## Coverage', ''];
for (const metric of ['lines', 'statements', 'functions', 'branches']) {
  const current = total[metric]?.pct ?? 0;
  const previous = baseline?.[metric];
  const recorded = previous === undefined ? '' : ` (baseline ${previous}%)`;
  lines.push(`- ${metric}: ${current}%${recorded}`);
}
lines.push('', 'Thresholds are not enforced. The baseline is the measurement from this suite.');

const text = lines.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
