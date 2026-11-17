# CLAIM — Ledgerly Connect Agent B

Posted for the shared mailbox on Accountabul PR #101 / issue #102.
This LedgerlyWalletDev token cannot write comments on `accountabul-final`; Agent A was asked to mirror the claim there.

```
STATUS: CLAIM — Cursor Ledgerly Connect (Agent B / wallet provider lane)

Coordination index: #102.

Harness/session: Cursor cloud agent bc-01a1e5a7-3dc4-7032-a3f6-dc2fe6db96a4

Repository / task / owned paths:
- Accountabul-LLC/LedgerlyWalletDev
- Extension provider, permissions, approval UI, signMessage ownership proofs,
  deferred connect for locked/uninitialized vaults, accountsChanged events
- Owned: extension/**, src/ledgerly/core/permissions/**, provider RPC/engine,
  Approval/Unlock/Onboarding connect UX, docs/architecture/ledgerly-connect.md,
  tests/readiness/47-ledgerly-connect-provider.test.ts

Branch: cursor/ledgerly-connect-provider-96a4
Base: main (fetched at claim time)
Accountabul Agent A: separate environment/branch cursor/ledgerly-connect-accountabul-96a4

No merge/deploy until independent security review (Agent C).
```

## Follow-up — aligned with Accountabul Agent A

Accountabul and Ledgerly stay **separate products**. Connect is browser-provider interop only.

### Ready branches (2026-11-17)

| Repo              | Branch                                     | Head                                                              | Gate                                        |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------- |
| LedgerlyWalletDev | `cursor/ledgerly-connect-provider-96a4`    | `6ed06a7064831a7ac0b5a34538ed45433a23d257` (+ docs commit on tip) | provider tests 7/7                          |
| accountabul-final | `cursor/ledgerly-connect-accountabul-96a4` | `f6acfa694d492778e6348dcd165d807a976af9e4`                        | gate 1059 pass; rebased on `main` `b434761` |

Contract:

- `requestAccounts` / `getAccounts` → bare `string[]`
- `signMessage({ message, address, network })` → `{ signature, publicKey, address, algorithm }`
- secp256k1: ECDSA(SHA-256(message)), IEEE-P1363
- optional `isUnlocked()`

### Open PRs manually (agent tokens cannot create PRs / comment on #101)

- Ledgerly: https://github.com/Accountabul-LLC/LedgerlyWalletDev/compare/main...cursor/ledgerly-connect-provider-96a4?expand=1
- Accountabul: https://github.com/Accountabul-Business-Account/accountabul-final/compare/main...cursor/ledgerly-connect-accountabul-96a4?expand=1

Suggested Accountabul PR title: `feat(wallet): Ledgerly Connect Phase 1 (Accountabul side)`  
Suggested Ledgerly PR title: `feat(connect): Ledgerly Connect provider for Accountabul (separate apps)`

After opening, post HANDOFF on Accountabul PR #101 with both PR URLs and the head SHAs above.
