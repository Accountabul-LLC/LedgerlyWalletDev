# Open source scope

What Ledgerly publishes so anyone can audit the security-sensitive code, and what stays
private because it is operational rather than protective.

## Publish

Everything below decides whether keys stay on the device and whether a transaction is what
the user approved. None of it contains credentials, infrastructure detail, or user data.

| Area                       | Path                                                                              | Why it belongs in public                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Randomness, AEAD, KDF      | `src/ledgerly/core/crypto/`                                                       | Proves Argon2id parameters, AES-GCM usage, non-extractable keys, and that no `Math.random` touches key material         |
| Vault format and access    | `src/ledgerly/core/vault/`                                                        | Proves the encrypted-at-rest format, header binding, password rules, lock/unlock guards                                 |
| Key derivation and signing | `src/ledgerly/core/keyring/`                                                      | Proves BIP39 to secp256k1 derivation at `m/44'/144'/index'/0/0`, and that the keyring signs but never exports           |
| XRPL transaction building  | `src/ledgerly/core/xrpl/`                                                         | Proves amounts, addresses, fees, and destination tags are validated before signing                                      |
| dApp permissions           | `src/ledgerly/core/permissions/`                                                  | Proves origin validation and phishing checks on connect requests                                                        |
| Approval queue and engine  | `src/ledgerly/core/engine/`                                                       | Proves no signing path bypasses explicit user confirmation                                                              |
| Storage ports and session  | `src/ledgerly/core/storage/`                                                      | Proves what is persisted and what is session-only                                                                       |
| RPC protocol               | `src/ledgerly/core/rpc/`                                                          | Lets integrators verify the message surface the extension exposes                                                       |
| Extension shell            | `extension/` (manifest, background, content, inpage, popup)                       | The distributed binary should be reproducible from public source                                                        |
| Worker isolation           | `src/ledgerly/web/worker.ts`, `workerTransport.ts`, `storage.ts`                  | Proves keys live in an isolated worker, not in page scope                                                               |
| Phone host                 | `mobile/src/runtime.ts`, `mobile/src/storage.ts`, `mobile/src/crypto-polyfill.ts` | Proves the native app dispatches the same allowlist, stores only ciphertext, and uses AES-GCM compatible with WebCrypto |
| Security tests             | `tests/readiness/01-05`, `11`, `12`, `tests/browser/phrase_leak.py`               | Auditors can run the same checks we run                                                                                 |
| Security docs              | `docs/security/`, this file                                                       | The audit trail itself                                                                                                  |

Upstream sync is already tracked in `src/ledgerly/core/UPSTREAM.json` and `scripts/core-sync.ts`,
so the public core and the shipped core can be diffed commit by commit.

## Keep private

| Area                                | Path                                                     | Why                                                                                                          |
| ----------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Backend server functions            | `src/lib/*.functions.ts`, `src/lib/*.server.ts`          | Pricing sources, metrics writes, profile handling; useful only to an attacker probing our endpoints          |
| Public API routes                   | `src/routes/api/`                                        | Shows secret-verification shape and rate surfaces                                                            |
| Backend clients and generated types | `src/integrations/`                                      | Project identifiers and schema shape                                                                         |
| Database migrations and policies    | `supabase/`                                              | RLS policy text is a roadmap for probing our data layer                                                      |
| Analytics and telemetry wiring      | `src/ledgerly/ui/metrics.ts`, `src/lib/error-capture.ts` | Internal product measurement, no user-safety claim rests on it                                               |
| Cloud sync                          | `src/ledgerly/ui/cloud/sync.ts`                          | Ties wallet labels to profiles; operational, not custodial                                                   |
| Secrets and environment             | `.env`, secret names, deployment config                  | Obvious                                                                                                      |
| CI/CD, hosting, monitoring config   | build and deploy pipeline                                | Infrastructure                                                                                               |
| Marketing site and product UI       | `src/routes/*.tsx`, `src/ledgerly/ui/views/`             | No security claim depends on it; keeping it closed avoids clone sites shipping a pixel-perfect phishing copy |

## Rules for the public repo

1. Publish by copy, not by opening this repo. The public repo contains only the paths above.
2. No `.env`, no project identifiers, no database URLs, no secret names.
3. Every publish is a tagged commit that matches a shipped extension version, so a user can
   diff what they installed against what we published.
4. Security reports route to a published contact address with a stated response window.
5. When a private module is imported by a public one, the public repo ships an interface stub,
   never the implementation.

## What we tell users

The parts that hold your keys are public: key generation, encryption, the vault format,
transaction building, and signing. You can read them, build them, and compare the build to the
extension you installed. Our servers, analytics, and deployment stay private, and they never
receive a key, a recovery phrase, or a password.
