# Connect Joey Wallet to Ledgerly

Let people bring a wallet they already use into Ledgerly instead of creating a new one.
First wallet supported: Joey, the XRPL browser extension. The same connect layer is built so
GemWallet, Crossmark and Xaman can be added later without redesigning anything.

Three things become possible with a Joey wallet:

1. **See it** in the unified dashboard next to your Ledgerly wallets, with balances, tokens and activity.
2. **Send from it** — Ledgerly builds the payment, Joey asks its owner to approve and signs it. Joey's keys never come to us, and Ledgerly's keys never go to Joey.
3. **Sign in with it** — use the wallet as your Ledgerly login, instead of email or Google.

A connected wallet is clearly badged as a Joey wallet everywhere it appears. It never offers
"reveal recovery phrase" or "remove from this device", because neither applies: the phrase lives in
Joey, and disconnecting is the right action instead.

## What you will see

**Connect.** A new "Connect a wallet you already have" card on the create-wallet page and in the
add-wallet menu. If Joey is not installed, the card explains what Joey is and links to it rather
than failing silently. If it is, Joey opens its own approval window, you pick which addresses to
share, and each one lands in your wallet list with a Joey badge.

**Dashboard.** Connected addresses behave like any other wallet card: balance, tokens, activity,
copy, hide-sensitive. The card header carries the Joey badge and the footer swaps
"Remove from device" for "Disconnect".

**Sending.** Same guided flow you have now — pick wallet, pick asset, enter or scan a destination,
review. On the final step, instead of Ledgerly's password prompt, the review screen says the
approval happens in Joey, and Joey's window opens. Real-money confirmation copy stays as it is.

**Signing in.** The sign-in screen gains "Continue with a wallet" beside email and Google. Joey
signs a plain login message (never a transaction), Ledgerly checks that signature on the server,
and you land on the same unified dashboard. Your connected addresses and their names follow you
across devices exactly like today's profile does.

**When Joey is locked, on the wrong network, or the person says no.** Each gets its own plain
message on the screen where it happened, not a generic error.

## Technical details

**SDK.** Add `@joeywallet/wallet-sdk` (MIT, zero runtime dependencies). Detection through
`waitForJoey()`, connection through `joey.connect({ name, icon })`, reconnect on load through
`connect({ silent: true })`. New module `src/ledgerly/ui/external/joey.ts` wraps the SDK; a small
`ExternalProvider` interface above it (`src/ledgerly/ui/external/provider.ts`) is what the rest of
the app talks to, so a second wallet is a second file.

**Account model.** Add an `external` variant to `AccountSource`
(`src/ledgerly/core/vault/schema.ts`): `{ kind: 'external', provider: 'joey', address }` — an
address and a label, no secret material. The keyring never loads it and `Keyring.sign` refuses it
by construction, so no code path can attempt a local signature for one. `src/ledgerly/core/` is the
upstream mirror, so this variant and its guards are added as a documented fork point in
`docs/upstream-fork.md` and picked up by `scripts/core-sync.ts`.

**Signing.** The engine runs in a worker with no page access, so it cannot reach `window.joey`.
Split the existing flow: `preparePayment` continues to build and autofill the transaction and
returns the `tx_json` for an external account instead of staging it for local signing. The UI hands
that `tx_json` to `joey.signAndSubmitTransaction({ account, chain, tx_json })`, then reports the
hash back through the existing submission-result path so activity, platform metrics and USD value
tracking work unchanged. `chain` is passed as a guard, so a network mismatch is refused rather than
signed. No timeout is placed around the approval call — the SDK's own 300s approval window governs.

**Sign-in.** `joey.signIn({ statement, nonce })` with a server-issued nonce. A new
`wallet_auth_nonces` table (RLS on, explicit grants, no anon read, single-use, short expiry) issues
and burns nonces. A server function verifies the CAIP-122 message: nonce matches and is unused,
domain is our own origin, issue time is fresh, and the signature verifies against the public key
whose derived address equals the claimed address (`ripple-keypairs`, already present through
`xrpl`). Hardware accounts return the challenge-transaction shape instead, which is narrowed with
`isChallengeSignIn` and verified as a signed transaction that was never submitted. On success the
server maps the address to a profile and issues a session; the address, not an email, is the
identity. Wallet-based profiles get the same delete-profile path that exists today.

**Storage and sync.** Connected addresses reuse `wallet_labels` with a provider column so the
watch-only `/balances` view and name memory keep working. Disconnect is the existing soft delete.

**Security.** The `external` variant is added to the ingest guards in `src/lib/ingest-guards.ts`
(address format, provider allowlist, bounded label). The daily vulnerability scanner gets the new
table in its expectations, and new readiness tests cover: an external account can never be signed
locally, a nonce cannot be replayed or used twice, a signature for address A cannot authenticate
address B, a wrong-domain or stale message is refused, and no recovery-phrase or export affordance
is reachable for a connected wallet.

**Not in this change.** GemWallet, Crossmark and Xaman. Xaman in particular needs an API key from
its developer console and a QR/push flow rather than a page provider, so it is its own piece of
work on top of the `ExternalProvider` interface this establishes.
