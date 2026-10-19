# Full security audit: access, headers, fuzzing, penetration probe

Date: 2026-08-31

Scope: the whole live application. Sign-in surface, route gates, server functions,
public HTTP endpoints, request headers, every database table and its privileges,
the third-party token feed, and the dependency tree. The signing paths in
`src/ledgerly/core/` are an upstream mirror and were reviewed, not rewritten.

Result: three real weaknesses found and fixed, one input-handling crash found by
the fuzzer and fixed, three test gaps closed, two risks accepted and recorded.
The suite is now 141 automated checks plus a 29 case live penetration probe, and
every one of them passes.

## Findings and fixes

| ID  | Area                                                 | Verdict  | Evidence and fix                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Table privileges                                     | FIXED    | Every table granted the full privilege set to signed-in people, and two granted it to anonymous visitors. That set includes emptying a table, which no access rule filters. Privileges are now the minimum each table needs.                                                         |
| F2  | Database web requests                                | FIXED    | The database's built-in web request helpers were executable by anyone holding a database role, which is the classic path to making a server fetch somewhere it should not. Execution is now backend only. The daily scheduled job is unaffected.                                     |
| F3  | Token feed ingest                                    | FIXED    | Values from the third-party token index went into the database unchecked: unbounded text, any URL scheme in the logo field, and any row shape. Every field is now shape-checked, length-bounded, and a logo must be a plain https URL. The feed response is capped and time limited. |
| F4  | Directory search                                     | FIXED    | The search box was cleaned by removing four characters. It is now an allowlist: letters, digits, space, dash and underscore, capped at 40 characters, so nothing left can carry meaning in the filter it is placed into.                                                             |
| F5  | Number handling                                      | FIXED    | The fuzzer crashed the bounds helper with an exotic value. It now returns the floor instead of throwing.                                                                                                                                                                             |
| F6  | Scheduled job token table                            | FIXED    | The table holding the job secret had no written access rule, only an absence of privileges. It now carries an explicit deny rule for visitors and signed-in people.                                                                                                                  |
| A1  | Sign-in surface                                      | PASS     | No anonymous sign-in, no auto-confirm. Password reset and sign-up redirects are same-origin and land on public pages. No credential or key is committed.                                                                                                                             |
| A2  | Route gates                                          | PASS     | The wallet is gated behind the unlock screen and the profile gate; no hidden admin or debug route exists.                                                                                                                                                                            |
| A3  | Server endpoints                                     | PASS     | Both scheduled endpoints demand a secret compared in constant time and refuse an empty or wrong one. The publishable key is not accepted as a secret.                                                                                                                                |
| A4  | Access rules                                         | PASS     | Every table has row level security, an explicit privilege grant and at least one rule. Writes are scoped to the signer. Anonymous writing is limited to a zero-value metrics event that can never be read back.                                                                      |
| A5  | Roles                                                | PASS     | No role is stored on a profile row.                                                                                                                                                                                                                                                  |
| A6  | Definer functions                                    | PASS     | All pin their search path and are executable only by the backend.                                                                                                                                                                                                                    |
| A7  | Headers                                              | PASS     | Content security policy, no-sniff, no-referrer, HSTS with subdomains, camera-only permissions, and framing restricted to our own origins. Hostile `X-Forwarded-*`, `Origin`, `Referer` and `User-Agent` values are neither reflected nor trusted.                                    |
| A8  | Dependencies                                         | PASS     | No high or critical vulnerability in the lockfile.                                                                                                                                                                                                                                   |
| R1  | Published reports readable by anyone                 | ACCEPTED | The daily code report table is public by design: it is the content of the public Security Center and the same text is in the public repository. It holds file names and hashes, never keys or user data.                                                                             |
| R2  | Web request extension installed in the shared schema | ACCEPTED | Placed there by the platform and needed by the daily scheduled job. Execution has been revoked from everyone but the backend, which removes the risk the placement carries.                                                                                                          |
| R3  | Inline scripts allowed by the policy                 | ACCEPTED | The server-rendered page ships an inline hydration payload, so inline scripts cannot be forbidden without breaking the app. Everything else is closed: no plugins, no external forms, no third-party frames.                                                                         |

## What now runs on every release

- `tests/readiness/14-ingest-fuzz.test.ts` (T125-T132): tens of thousands of
  hostile strings, injection payloads, prototype-pollution keys, control
  characters, oversized input and non-string values pushed through every guard.
  The invariants are that a search term can only ever be plain characters, stored
  text is bounded and single line, a stored image URL is always plain https, a
  stored number is always real and in range, and no guard ever throws.
- `tests/readiness/15-privilege-policy.test.ts` (T133-T139): reads the migration
  history and fails if any table ever hands blanket privileges to visitors, if
  anyone but the backend can empty a table, if the public tables stop being read
  only, or if the metrics table becomes readable.
- `tests/browser/pentest.py` (`bun run test:pentest`): 29 live attempts to reach
  the scheduled endpoints without a token, forge a high-value metrics event, read
  or write the private tables straight through the data API, frame the page, and
  smuggle headers. Registered as an advisory gate in `bun run readiness` because
  it needs a running server.

## Test gaps closed while auditing

- The route metadata check only recognised one way of writing the metadata
  function and so missed a page that had it. It now recognises both.
- The clipboard check assumed a single call site; a second one had appeared. All
  copying now goes through one audited helper.
- The phrase leak check read a storage key name as a leaked word, which made it
  fail at random. Key names are now excluded, values still are not.

## Verification

`bunx tsgo --noEmit` clean. `bunx vitest run`: 141 passed, 0 failed.
`python3 tests/browser/pentest.py`: 29 of 29 attempts refused. Dependency scan:
no high or critical findings. Database linter: only the accepted extension
placement remains.
