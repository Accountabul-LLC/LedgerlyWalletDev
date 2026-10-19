# Full security audit: leakage, header injection, fuzzing, penetration test

Goal: run a complete adversarial pass over Ledgerly, fix everything that fails, and leave behind
automated checks so the same weaknesses cannot come back.

## 1. Access and data leakage audit

Follow the access lockdown checklist end to end and record a verdict for every item:

- Sign-in surface: no anonymous sign-in, OAuth redirects same-origin only, reset/magic-link flows
  land on public routes, sign-out clears cached wallet data and uses history replace.
- Route gates: every protected route sits behind the real gate, no hidden admin/debug route.
- Server functions and `/api/public/*` handlers: each one is either authenticated, secret-verified,
  or deliberately public and returns nothing private. Secret comparison stays constant-time.
- Database: RLS, grants, and at least one policy on every table; no anonymous read on the metrics
  table; every write policy scoped to `auth.uid()` with a `WITH CHECK`; security-definer functions
  pin `search_path` and have EXECUTE revoked where appropriate.
- Service-role usage only inside handlers after the caller is verified.
- Run the backend linter and the platform security scan, and triage every result.

## 2. Header and injection hardening

- Review the response headers set in the server entry: content security policy, frame ancestors,
  nosniff, referrer policy, HSTS, permissions policy. Confirm no header value is built from
  request-supplied data.
- Check every place a request header, query string, path segment, or third-party API response is
  read, and confirm each is validated before it reaches a database query, a redirect, a log line,
  or an outbound request. Specifically: the audit hook secret headers, the token sync route, and
  the price feed.
- Confirm no response header or redirect location can carry newline characters from user input
  (header/response splitting), and that no user value is reflected into HTML.

## 3. Fuzz testing

Extend the readiness suite with a new fuzz file that hammers the untrusted boundaries:

- Public endpoint handlers: random and hostile header values, oversized bodies, wrong content
  types, unicode and newline payloads, missing and duplicated secrets. Expect a clean 4xx, never a
  crash, a stack trace, or a secret in the body.
- Server function input validators: random JSON shapes, deep nesting, huge numbers, NaN, negative
  values, and prototype-pollution keys (`__proto__`, `constructor`).
- Existing parsers already fuzzed (amounts, addresses, hostnames, passwords) get a longer run and
  a check that no error message ever echoes secret material.

## 4. Penetration test (live browser and HTTP)

Driven against the running app, scripted so it can be re-run:

- Unauthenticated requests to every protected route and server function; expect redirect or 401,
  never data.
- Cross-user access attempt: try to read and write another profile's rows directly through the API.
- Replay and forge the daily-audit and token-sync cron calls without the secret, with a wrong
  secret, and with a truncated secret.
- Attempt to frame the wallet in an iframe, inject a script through a stored wallet label or
  contact name, and drive a send flow from a crafted URL to confirm nothing auto-submits.
- Re-run the existing recovery phrase leak browser test and confirm storage, IndexedDB, cookies,
  DOM, and network traffic stay clean.

## 5. Report and gates

- Findings written to `docs/security/<date>-full-security-audit.md`: a table of every check with
  verdict and evidence, fixes applied this run, accepted risks with reasons, and any question that
  needs a human decision.
- Every FAIL found is fixed in the same run; no policy is weakened to make a check pass.
- New tests join `bun run readiness`, and the run ends with a typecheck plus the full suite so the
  result is verified, not asserted.

## Technical notes

- New test files: `tests/readiness/14-header-injection.test.ts`,
  `tests/readiness/15-endpoint-fuzz.test.ts`; new script `tests/browser/pentest.py`.
- Endpoint fuzzing calls the handlers directly in-process where possible, and over HTTP against the
  local dev server for the public routes.
- Upstream mirror under `src/ledgerly/core/` is reported on, not rewritten.
