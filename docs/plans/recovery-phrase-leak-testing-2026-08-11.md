# Recovery phrase leak testing

Goal: prove, with automated tests that run on every release, that a recovery phrase or family seed typed into or shown by Ledgerly is never stored, transmitted, cached, or recoverable from anywhere outside the encrypted vault.

## What gets tested

Three new test files added to the existing readiness suite (currently 92 checks), plus one live browser test.

### 1. Static source policy (extends the existing source-policy checks)

Scans every source file under `src/` and `extension/` for patterns that would leak a phrase:

- No phrase, seed, or password value is ever written to `localStorage`, `sessionStorage`, cookies, or IndexedDB outside the encrypted vault write path.
- No phrase or seed value appears in any `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `postMessage` to a non-worker target, or analytics/metrics call.
- No phrase, seed, or password is logged, thrown inside an error message, or included in error-reporting payloads (`src/lib/error-capture.ts`, `lovable-error-reporting.ts`).
- Every field that accepts a phrase, seed, or password sets `autoComplete="off"` (or `new-password`/`current-password`), `spellCheck={false}`, `autoCapitalize="off"`, and `autoCorrect="off"` so browsers and keyboards do not save or suggest the words.
- No phrase input is rendered inside a `<form>` that can submit to a URL, and no phrase value is ever placed into a route param, query string, or hash.
- No third-party script or iframe is present on the setup, backup, verify, unlock, or import screens.

### 2. Memory and lifecycle behaviour

Unit tests against the real onboarding and import logic:

- Creating a wallet returns the phrase once; after backup confirmation, no module-level or store-level reference to it remains.
- The verify step compares typed words against the in-memory phrase only, never persists partial answers, and clears answers when the step unmounts.
- Importing a phrase or family seed hands the value straight to the worker and clears the local state field afterwards.
- The persisted vault blob is scanned for any plaintext word from the phrase: it must contain none, and the same phrase encrypted twice must produce different ciphertext.
- After lock, the stored record contains no plaintext phrase, seed, or password material.

### 3. Live browser verification (Playwright, run as part of the suite)

Drives a real browser through create wallet, reveal phrase, confirm backup, and import phrase, then asserts:

- `localStorage`, `sessionStorage`, and cookies contain none of the 24 words after each step.
- Every IndexedDB record is scanned; the words appear nowhere in plaintext.
- No network request made during the flow contains any phrase word in its URL, headers, or body.
- The rendered DOM after leaving the backup screen no longer contains the words, and the seed grid is blurred until reveal.
- Clipboard copy is user-initiated only, with no automatic copy on render.

## Reporting

A findings document at `docs/security/<date>-recovery-phrase-leak-test.md` listing each check, its verdict, and evidence. The new checks join `bun run readiness` so any regression blocks a release.

## Technical notes

- New files: `tests/readiness/11-phrase-containment.test.ts`, `tests/readiness/12-phrase-lifecycle.test.ts`, `tests/browser/phrase-leak.spec.ts`.
- Playwright is already available in the sandbox; the browser test runs against the local dev server and is registered as a readiness gate.
- No production behaviour changes are planned. If a test uncovers a real leak (for example a missing `autoComplete="off"` on a phrase field), that fix is applied in the same run and recorded in the report.
