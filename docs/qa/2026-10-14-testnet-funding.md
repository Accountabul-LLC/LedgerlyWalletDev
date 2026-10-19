# Testnet funding and network switching

## Expected behavior

Both web wallet views submit one faucet request per funding action, then wait for
a validated increase over a freshly read balance. An existing account alone does
not prove a top-up arrived. Temporary ledger read errors may be retried; faucet
POSTs are never retried automatically. Funding errors appear beside the wallet.

Faucet HTTP requests have a 20-second timeout. An accepted request is observed for
up to 20 polls, one second apart, with a 60-second polling deadline. An individual
ledger read can take up to the existing 20-second request timeout. Expiry means
funding is pending, not rejected: refresh before requesting again. Switching
networks or locking stops observation of the original funding operation.

Hiding an active built-in test network switches to Mainnet before hiding it.
Selection, persisted preference and connection must agree. Web controls confirm
network changes, including the move to Mainnet caused by hiding Testnet. Network
mutations are serialized and discard staged transactions. Connections and query
results from earlier network generations are rejected.

## Ownership

The shared engine is a deliberate Ledgerly fork. `engine/engine.ts` was already
excluded from upstream overwrites; `xrpl/connection.ts` is now also recorded in
`scripts/core-sync.ts`. Future upstream syncs must review this connection fix.
Authentication, endpoints, migrations and signing rules are unchanged.

## Evidence

- Before the fix, an isolated engine reported Mainnet while its connection and
  saved preference still referenced Testnet after hiding test networks. Showing
  test networks restored Testnet without a network selection.
- A deferred connection reproduction returned the old Testnet client for a
  request made after selecting Mainnet. Regression tests now reject that client
  and reject results already in flight on the previous network.
- Live Testnet node probe: connection/server-info completed in 723 ms, network ID
  1, validated ledger age 3 seconds. Faucet CORS preflight returned 204 in 528 ms.
- A newly generated disposable Testnet address received 100 test XRP. Faucet
  acceptance took 620 ms; validated account balance was visible after 6,785 ms.
  No user wallet, recovery secret, or real funds were used.
- Browser QA uses real wallet components with a disposable mocked wallet and
  mocked profile services. It checks faucet error visibility, network
  confirmation, error recovery, and hiding Testnet. This verifies UI behavior;
  it does not claim the production deployment has been updated.

## Regression commands

```sh
npx vitest run tests/readiness/37-testnet-funding.test.ts tests/readiness/38-network-connection.test.ts
npm run typecheck
npm run build
```

External faucet availability and rate limits remain outside Ledgerly's control.
The UI now explains those failures instead of silently appearing to do nothing.

## Verification status

The 11 funding/connection regression tests pass. TypeScript, scoped lint and the
production build pass. Rendered QA confirmed the combined-wallet faucet error,
the corrected error layout, Mainnet confirmation when hiding Testnet, and the
visible retry state after a network-switch failure. The security fingerprint
tests pass after regenerating the audit manifest.

The full suite initially passed 281 of 284 tests: two required the updated audit
manifest and now pass. The remaining native Argon2 scheduling test
(`tests/readiness/24-native-kdf-scheduling.test.ts`) times out at its normal
30-second limit and also timed out in an isolated run with a 90-second limit.
That test and its cryptography implementation were not changed by this fix.
The full QA gate remains blocked by that timeout; this change is delivered as
a draft PR and is not merged or deployed.
