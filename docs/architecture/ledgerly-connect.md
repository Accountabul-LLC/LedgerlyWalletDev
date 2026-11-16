# Ledgerly Connect — provider contract

Status: Phase 1 implementation on `cursor/ledgerly-connect-provider-96a4` (Agent B).
Coordination: Accountabul issue #102 / PR #101 mailbox.

## Separation of concerns

- **Ledgerly** owns vault unlock, origin permissions, human approval, and cryptographic signing.
- **Accountabul** owns authenticated user identity, single-use ownership challenges, and persistent `member_wallet_connections`.
- Remaining connected is not remaining unlocked. Permission grants survive vault auto-lock; signing still requires unlock + approval.

## Page provider: `window.ledgerly`

Injected by the MV3 extension (`extension/src/inpage.ts`). Detection:

```js
const ready = Boolean(window.ledgerly?.isLedgerly);
// or listen for: window.addEventListener('ledgerly#initialized', ...)
```

### Methods

| Method | Behavior |
| --- | --- |
| `ping()` | `{ version }` |
| `getStatus()` | `{ setup, unlocked, authorized, networkId, chainId, isTest }` without prompting |
| `getNetwork()` | Active XRPL network metadata |
| `getAccounts()` | Granted classic addresses; empty when locked or unauthorized |
| `requestAccounts()` | Returns existing grants, or opens Ledgerly for unlock/setup + connect approval |
| `signMessage({ address, message })` | UTF-8 message signed with `ripple-keypairs` after approval |
| `signTransaction` / `signAndSubmit` | XRPL tx paths; still require per-request approval |
| `disconnect()` | Revokes this origin’s grant and emits `disconnect` / `accountsChanged` |
| `on` / `removeListener` | `accountsChanged`, `disconnect`, `networkChanged` |
| `request({ method, params })` | Same allowlist as named methods |

### Error codes (`Error.name`)

`user_rejected` · `wallet_locked` · `wallet_setup_required` · `unauthorized` · `pending_request` · `invalid_request` · `wallet_error`

### Message signing (ownership proofs)

Ledgerly does **not** use an XRPL payment/transaction signature as a stand-in for arbitrary message signing.

1. Site obtains a server-issued challenge string (nonce bound to user, address, origin, network, expiry).
2. After `requestAccounts`, call `signMessage({ address, message })`.
3. User sees the exact message in Ledgerly and approves.
4. Response: `{ address, publicKey, signature, message }`.
5. Server verifies with `ripple-keypairs.verify(hex(utf8(message)), signature, publicKey)` and `deriveAddress(publicKey) === address`, then consumes the nonce.

This matches Ledgerly’s existing Joey challenge verification pattern.

### Locked / first-run behaviour

If `requestAccounts` arrives with no vault or a locked vault, Ledgerly opens its UI, keeps the site request pending, and resumes the connect approval after unlock (or after create/import + backup confirmation). Recovery phrases are never collected by the dApp.

### Persistence

Per-origin grants live in the extension permission store (`accountIds`, `grantedAt`, `lastUsedAt`), independent of session unlock. Accountabul should persist its own verified association after server proof; it must not re-prompt ownership on every refresh when that record is still active.
