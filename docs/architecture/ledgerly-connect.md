# Ledgerly Connect — provider contract

Status: Phase 1 aligned with Accountabul Agent A (`cursor/ledgerly-connect-accountabul-96a4`).
Coordination: Accountabul issue #102 / PR #101 mailbox.

## Two separate products

Ledgerly Wallet (`LedgerlyWalletDev` / Ledgerly-Wallet) and Accountabul (`accountabul-final`) stay **separate codebases, deployments, and databases**. They are not merged. Accountabul talks to Ledgerly only through the browser extension’s page provider (`window.ledgerly`). Keys and recovery material never leave Ledgerly.

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

### Methods (Accountabul Phase 1)

| Method | Returns | Notes |
| --- | --- | --- |
| `isLedgerly` | `true` | Required detection flag |
| `isUnlocked()` | `boolean` | Optional for Accountabul; implemented |
| `getStatus()` | `{ setup, unlocked, authorized, networkId, chainId, isTest }` | Non-prompting |
| `getNetwork()` | Active XRPL network metadata | |
| `getAccounts()` | `string[]` | Classic addresses; empty when locked/unauthorized |
| `requestAccounts({ network? })` | `string[]` | `network`: `xrpl:testnet` \| `xrpl:devnet` |
| `signMessage({ message, address, network })` | `{ signature, publicKey, address, algorithm }` | Also includes `message` for debugging |
| `signTransaction` / `signAndSubmit` | XRPL tx paths | Still require per-request approval |
| `disconnect()` | `void` | Revokes grant; emits `disconnect` / `accountsChanged` |
| `on` / `removeListener` | — | `accountsChanged`, `disconnect`, `networkChanged` |
| `request({ method, params })` | same allowlist | Accountabul falls back to `method: "signMessage"` only if needed |

### Error codes (`Error.name`)

`user_rejected` · `wallet_locked` · `wallet_setup_required` · `unauthorized` · `pending_request` · `invalid_request` · `wallet_error`

### Message signing (ownership proofs)

Ledgerly does **not** use an XRPL payment/transaction signature as a stand-in for arbitrary message signing.

Algorithm (must match Accountabul `verify-signature.server.ts`):

- **secp256k1**: ECDSA over `SHA-256(utf8(message))`, IEEE-P1363 compact `r‖s` (64 bytes hex)
- **ed25519**: EdDSA over the raw UTF-8 message bytes
- Public keys use XRPL encodings (`02`/`03` compressed secp, `ED…` ed25519)

Flow:

1. Accountabul builds the canonical challenge (`src/lib/wallet/challenge-message.ts`).
2. After `requestAccounts({ network })`, call `signMessage({ message, address, network })`.
3. User sees the exact message in Ledgerly and approves.
4. Server verifies signature + `publicKey → address`, then consumes the nonce.

### Locked / first-run behaviour

If `requestAccounts` arrives with no vault or a locked vault, Ledgerly opens its UI, keeps the site request pending, and resumes the connect approval after unlock (or after create/import + backup confirmation). Recovery phrases are never collected by the dApp.

### Persistence

Per-origin grants live in the extension permission store (`accountIds`, `grantedAt`, `lastUsedAt`), independent of session unlock. Accountabul persists its own verified association after server proof and must not re-prompt ownership on every refresh when that record is still active.
