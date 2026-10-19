/**
 * Fails when the production Supabase project shows up outside the allowlist.
 * Dev, preview, and local code must not point at LedgerlyWallet.com's project.
 * The unit-test job runs this file with the rest of the Vitest suite.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PRODUCTION_REF = 'srvzinigfedppxwypmtt';
const SELF = 'tests/readiness/47-production-ref-guard.test.ts';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'coverage',
  'dist',
  '.output',
  '.expo',
  '.turbo',
  '.vercel',
  'android',
  'ios',
  '.next',
]);

function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}

function isDoc(path: string): boolean {
  return path === 'README.md' || path.endsWith('/README.md') || path.startsWith('docs/');
}

function isSeoOrFixture(path: string): boolean {
  const base = path.split('/').pop() ?? '';
  if (base === 'sitemap.xml' || base === 'robots.txt') return true;
  if (path.startsWith('public/') && /sitemap|robots/i.test(path)) return true;
  if (path.includes('/fixtures/') || path.includes('.fixture.')) return true;
  return false;
}

/** True when the ref survives outside the production EAS profile. */
function easRefOutsideProductionProfile(source: string): boolean {
  try {
    const json = JSON.parse(source) as { build?: Record<string, unknown> };
    if (!json.build || !('production' in json.build)) return source.includes(PRODUCTION_REF);
    const rest = { ...json.build };
    delete rest.production;
    return JSON.stringify({ ...json, build: rest }).includes(PRODUCTION_REF);
  } catch {
    return true;
  }
}

/**
 * A matching line is allowed only for a known production description, the
 * production phone fallback, a redaction pattern, or the refusal host.
 */
export function productionRefAllowed(path: string, line: string, source: string): boolean {
  const file = normalize(path);
  if (file === SELF) return true;
  if (isDoc(file) || isSeoOrFixture(file)) return true;
  if (file === 'mobile/src/supabase.ts' || file === 'mobile/README.md') return true;
  if (file === 'mobile/eas.json') return !easRefOutsideProductionProfile(source);
  if (file === 'scripts/oss-export.ts')
    return line.includes('pattern:') && line.includes(PRODUCTION_REF);
  if (file === 'apps/mobile/test/audit.test.cjs') {
    return /assert\./.test(line) && line.includes(PRODUCTION_REF);
  }
  if (file === 'src/lib/activity-report.ts') {
    return line.includes('PRODUCTION_SUPABASE_REF') && line.includes(PRODUCTION_REF);
  }
  // Readiness fixture: these lines are inputs that must not be contacted.
  if (file === 'tests/readiness/36-phone-activity.test.ts') return true;
  return false;
}

function matchingLines(source: string): { line: number; text: string }[] {
  return source
    .split(/\r?\n/)
    .flatMap((text, index) => (text.includes(PRODUCTION_REF) ? [{ line: index + 1, text }] : []));
}

export function productionRefViolations(path: string, source: string): string[] {
  if (!source.includes(PRODUCTION_REF)) return [];
  return matchingLines(source)
    .filter((entry) => !productionRefAllowed(path, entry.text, source))
    .map((entry) => `${normalize(path)}:${entry.line}`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(join(dir, entry.name));
  }
  return out;
}

function scanRepository(): string[] {
  const violations: string[] = [];
  for (const file of walk(ROOT)) {
    const info = statSync(file);
    if (info.size > 2_000_000) continue;
    const source = readFileSync(file);
    if (source.includes(0)) continue;
    const path = normalize(relative(ROOT, file));
    violations.push(...productionRefViolations(path, source.toString('utf8')));
  }
  return violations;
}

describe('production Supabase ref stays out of dev code', () => {
  it('fails when the ref or its supabase.co URL appears outside the allowlist', () => {
    expect(scanRepository()).toEqual([]);
  });

  it('allowlists the production fallback, redaction pattern, docs, and SEO fixtures', () => {
    expect(productionRefAllowed('mobile/src/supabase.ts', `ref ${PRODUCTION_REF}`, 'x')).toBe(true);
    expect(productionRefAllowed('mobile/README.md', PRODUCTION_REF, PRODUCTION_REF)).toBe(true);
    expect(productionRefAllowed('docs/environments.md', PRODUCTION_REF, PRODUCTION_REF)).toBe(true);
    expect(productionRefAllowed('README.md', PRODUCTION_REF, PRODUCTION_REF)).toBe(true);
    expect(
      productionRefAllowed('public/sitemap.xml', `https://${PRODUCTION_REF}.supabase.co`, 'x'),
    ).toBe(true);
    expect(
      productionRefAllowed('tests/fixtures/backend.json', PRODUCTION_REF, PRODUCTION_REF),
    ).toBe(true);
    expect(
      productionRefAllowed(
        'scripts/oss-export.ts',
        `  { label: 'backend project ref', pattern: /vsaouxymljdcbbsissom|${PRODUCTION_REF}/i },`,
        '',
      ),
    ).toBe(true);
    expect(
      productionRefAllowed('scripts/oss-export.ts', `const ref = '${PRODUCTION_REF}'`, ''),
    ).toBe(false);
    expect(
      productionRefAllowed(
        'apps/mobile/test/audit.test.cjs',
        `  assert.equal(backend, '${PRODUCTION_REF}');`,
        '',
      ),
    ).toBe(true);
    expect(
      productionRefAllowed(
        'apps/mobile/test/audit.test.cjs',
        `const backend = '${PRODUCTION_REF}'`,
        '',
      ),
    ).toBe(false);
    const productionProfile = JSON.stringify({
      build: {
        preview: { env: { EXPO_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co` } },
        production: { env: { EXPO_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co` } },
      },
    });
    expect(productionRefAllowed('mobile/eas.json', PRODUCTION_REF, productionProfile)).toBe(false);
    const productionOnly = JSON.stringify({
      build: {
        preview: { environment: 'preview' },
        production: { env: { EXPO_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co` } },
      },
    });
    expect(productionRefAllowed('mobile/eas.json', PRODUCTION_REF, productionOnly)).toBe(true);
    expect(
      productionRefAllowed(
        'src/lib/activity-report.ts',
        `export const PRODUCTION_SUPABASE_REF = '${PRODUCTION_REF}';`,
        '',
      ),
    ).toBe(true);
    expect(
      productionRefAllowed(
        'src/lib/activity-report.ts',
        `const url = 'https://${PRODUCTION_REF}.supabase.co'`,
        '',
      ),
    ).toBe(false);
    expect(
      productionRefViolations('src/app.ts', `fetch('https://${PRODUCTION_REF}.supabase.co')`),
    ).toEqual(['src/app.ts:1']);
  });
});
