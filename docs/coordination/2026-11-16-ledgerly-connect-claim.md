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

Accountabul branch `cursor/ledgerly-connect-accountabul-96a4` @ `969406f81e8e26591eecc5cc51647417ade30322` expects:

- `requestAccounts` / `getAccounts` → bare `string[]`
- `signMessage({ message, address, network })` → `{ signature, publicKey, address, algorithm }`
- secp256k1: ECDSA(SHA-256(message)), IEEE-P1363 (not Joey/ripple-keypairs hex signing)
- optional `isUnlocked()`

Ledgerly branch updated to match. Open PRs manually if forge create remains blocked:

- Ledgerly: https://github.com/Accountabul-LLC/LedgerlyWalletDev/compare/main...cursor/ledgerly-connect-provider-96a4?expand=1
- Accountabul: https://github.com/Accountabul-Business-Account/accountabul-final/compare/main...cursor/ledgerly-connect-accountabul-96a4?expand=1
