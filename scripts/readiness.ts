/**
 * Release readiness gate.
 *
 * Runs every check that has to pass before Ledgerly ships, prints one line per
 * gate, and exits non-zero if any of them fail.
 *
 *   bun run readiness
 */

interface Gate {
  readonly name: string;
  readonly command: string[];
  /** Advisory gates report but do not block the release. */
  readonly advisory?: boolean;
  /**
   * Returns a reason when the gate cannot run here at all. A gate that never
   * ran is reported as SKIP, so a missing precondition in the sandbox does not
   * read like a real warning about the code.
   */
  readonly skip?: () => string | null;
}

const GATES: Gate[] = [
  { name: 'Types', command: ['bunx', 'tsc', '--noEmit'] },
  { name: 'Lint', command: ['bun', 'run', 'lint'], advisory: true },
  { name: 'Readiness tests', command: ['bunx', 'vitest', 'run'] },
  { name: 'Vulnerability scan', command: ['bun', 'run', 'scripts/security-scan.ts'] },
  {
    name: 'Upstream core drift',
    command: ['bun', 'run', 'core:check'],
    advisory: true,
    skip: () =>
      process.env['GITHUB_TOKEN'] ? null : 'no GitHub token, upstream cannot be compared',
  },
  // Needs a running dev server, Playwright and a signed in profile, so it
  // reports rather than blocks.
  {
    name: 'Recovery phrase leak (live browser)',
    command: ['python3', 'tests/browser/phrase_leak.py'],
    advisory: true,
    skip: () =>
      process.env['LOVABLE_BROWSER_AUTH_STATUS'] === 'injected'
        ? null
        : 'no signed in profile, the wallet screens are gated',
  },
  // Attacks the running app and the live backend, so it needs a server on the
  // other end. Advisory for the same reason.
  {
    name: 'Penetration probe (live)',
    command: ['python3', 'tests/browser/pentest.py'],
    advisory: true,
    skip: () => (process.env['VITE_SUPABASE_URL'] ? null : 'no backend URL in the environment'),
  },
];

const results: { gate: Gate; ok: boolean; ms: number; skipped: string | null }[] = [];

for (const gate of GATES) {
  const skipped = gate.skip?.() ?? null;
  if (skipped) {
    results.push({ gate, ok: true, ms: 0, skipped });
    continue;
  }
  const started = Date.now();
  const proc = Bun.spawnSync(gate.command, { stdout: 'inherit', stderr: 'inherit' });
  results.push({ gate, ok: proc.exitCode === 0, ms: Date.now() - started, skipped: null });
}

console.log('\n─── Release readiness ───');
for (const { gate, ok, ms, skipped } of results) {
  if (skipped) {
    console.log(`SKIP  ${gate.name} (${skipped})`);
    continue;
  }
  const status = ok ? 'PASS' : gate.advisory ? 'WARN' : 'FAIL';
  console.log(`${status.padEnd(5)} ${gate.name} (${(ms / 1000).toFixed(1)}s)`);
}

const blocking = results.filter((result) => !result.ok && !result.gate.advisory);
if (blocking.length > 0) {
  console.log(`\nNot ready to ship: ${blocking.map((r) => r.gate.name).join(', ')} failed.`);
  process.exit(1);
}
console.log('\nReady to ship.');
