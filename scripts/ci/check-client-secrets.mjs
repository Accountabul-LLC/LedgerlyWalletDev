import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['.output/public', 'dist/client'];
const TEXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map', '.svg']);
const PEM = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{20,}/;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path, files);
    else if (TEXT.has(path.slice(path.lastIndexOf('.')))) files.push(path);
  }
  return files;
}

function role(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role;
  } catch {
    return undefined;
  }
}

const roots = ROOTS.filter((dir) => {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
});

if (roots.length === 0) {
  console.error('No client bundle found. Build the web app before this check.');
  process.exit(1);
}

const findings = [];
for (const path of roots.flatMap((dir) => walk(dir))) {
  const source = readFileSync(path, 'utf8');
  if (PEM.test(source)) findings.push(`${path}: PEM private key`);
  if (SECRET_KEY.test(source)) findings.push(`${path}: Supabase secret key`);
  for (const token of source.match(JWT) ?? []) {
    if (role(token) === 'service_role') findings.push(`${path}: service-role JWT`);
  }
}

if (findings.length > 0) {
  console.error('Client bundle contains privileged key material:');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(`Client bundles in ${roots.join(', ')} have no service-role or private keys.`);
