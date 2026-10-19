# Release readiness suite

Run everything:

```bash
bun run readiness      # types, lint, all tests, upstream drift check
bun run test           # tests only
bun run test:watch     # tests in watch mode
```

The suite is 81 checks across nine files in `tests/readiness/`. Every check is
numbered (`T01` … `T81`) so a failure names exactly what regressed.

| File                            | Area                                                                          | Checks    |
| ------------------------------- | ----------------------------------------------------------------------------- | --------- |
| `01-crypto.test.ts`             | Byte handling, RNG, AES-GCM sealing, Argon2id key derivation                  | T01–T12   |
| `02-keyring.test.ts`            | Recovery phrases, BIP44 derivation, family-seed import                        | T13–T22   |
| `03-money.test.ts`              | Drops arithmetic, decimal parsing, currency codes, amount fuzzing             | T23–T30   |
| `04-addresses-networks.test.ts` | Classic and X-addresses, destination tags, network endpoints, address fuzzing | T31–T38   |
| `05-vault-access.test.ts`       | Password strength, unlock throttling and lockout persistence                  | T39–T46   |
| `06-site-policy.test.ts`        | dApp origin parsing, phishing and lookalike detection, hostname fuzzing       | T47–T54   |
| `07-presentation.test.ts`       | Formatting helpers used across the wallet UI                                  | T55–T59   |
| `08-source-policy.test.ts`      | Static policy scan of the codebase                                            | T60–T70   |
| `09-database-policy.test.ts`    | Static policy scan of the database migrations                                 | T71–T81   |
| `14-ingest-fuzz.test.ts`        | Fuzzing of every guard that sits between outside input and the database       | T125–T132 |
| `15-privilege-policy.test.ts`   | Table privileges: no blanket grants, nobody but the backend may empty a table | T133–T139 |

## Test types covered

- **Unit** — one function, known inputs and outputs.
- **Property** — round-trips such as encode/decode and XRP/drops must return the original value.
- **Fuzz** — thousands of random and hostile strings pushed through amount parsing, address
  resolution, password scoring and site assessment. The rule is that they either return a
  valid result or throw a readable `Error`, never crash or return junk.
- **Negative and boundary** — wrong keys, tampered ciphertext, downgraded key-derivation
  parameters, out-of-range destination tags, supply-cap amounts.
- **Security policy** — the codebase may not log or store secret material, may not carry a
  service-role key, may not derive keys outside the signing worker, and may not use unsafe
  DOM sinks.
- **Database policy** — every table has row level security, explicit grants and at least one
  policy; anonymous writes are limited to the append-only probe sink (never the public
  counters) and metrics rows can never be read back; security-definer functions pin their search path.
- **Regression guards** — a hex-encoded token that spells XRP must never render as XRP, and
  unlock lockouts must survive a restart.

- **Recovery phrase containment** — no secret may be stored, sent, logged, put in a URL or
  captured by autofill, and every phrase, seed, word or password field opts into the hardened
  input treatment.
- **Recovery phrase lifecycle** — the real engine is driven through create, restore, import,
  reveal, lock and reset, and every persisted byte is searched for plaintext key material.

## Live penetration probe

`bun run test:pentest` attacks the running app and the live backend: scheduled
endpoints without a token, a forged high-value metrics event, direct reads and
writes of the private tables, framing, and header smuggling. Every case passes
only when the attempt is refused. It needs a running server, so `bun run readiness`
treats it as advisory.

## Live browser check

`python3 tests/browser/dialog_focus.py` checks the shared dialog in Chromium for
uninterrupted typing, caret and selection edits, multiline and password fields,
keyboard navigation, close handlers, and autofocus. It needs npm dependencies
and Python Playwright with Chromium installed, but no server or backend.

`bun run test:phrase-leak` walks Chromium through setup against the dev server and inspects
storage, cookies, IndexedDB, the DOM and every network request for phrase words. It needs
Playwright and a running server, so `bun run readiness` treats it as advisory.

## Adding a check

Append to the relevant file with the next free `T` number, or create a new numbered file and
extend the table above. Keep every assertion deterministic; fuzz cases assert invariants, not
specific random values.

## Intentional exemptions

One policy carve-out remains for `public.probe_events`: anonymous users may insert a probe
attempt, but that table is never readable from the browser and never feeds public counters.
`public.platform_events` accepts no browser writes at all — any anonymous insert grant that
was not later revoked, or any read grant on that table, fails the suite.

`go run tests/browser/confirmation_template.go` renders the actual Supabase email
template with standard Go helpers, checking default, trailing-slash, and explicit
confirmation redirects. It requires a Go compiler.
