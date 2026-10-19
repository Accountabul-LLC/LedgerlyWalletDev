import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function audit(args) {
  const result = spawnSync('npm', ['audit', '--json', ...args], { encoding: 'utf8' });
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return {};
  }
}

const production = new Set(Object.keys(audit(['--omit=dev']).vulnerabilities ?? {}));
const advisories = [];
for (const [name, vuln] of Object.entries(audit([]).vulnerabilities ?? {})) {
  if (production.has(name)) continue;
  if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue;
  const via = (vuln.via ?? []).find((item) => typeof item === 'object');
  advisories.push(`- ${vuln.severity}: ${name}${via?.title ? ` — ${via.title}` : ''}`);
}

const lines = ['## Development dependency advisories', ''];
if (advisories.length === 0)
  lines.push('No high or critical advisories outside production dependencies.');
else {
  lines.push(
    'These do not fail the build. Production dependencies are gated separately.',
    '',
    ...advisories,
  );
}
const text = lines.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
