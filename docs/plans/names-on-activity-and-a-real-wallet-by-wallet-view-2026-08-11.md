# Names on activity, and a real wallet-by-wallet view

## 1. Know who you paid, and who paid you

Right now activity rows only show a shortened address ("rfNMex...zRKPJj"). Every row will instead lead with a name when one is known:

- One of your own wallets: "Received from Wallet 03", "Sent to Wallet 07", with the short address underneath.
- A saved contact: "Sent to Mom".
- Nobody known: the short address stays exactly as it is today, with a small "Save as contact" action so the next payment shows a name.
- Faucet payments keep the existing "Official Testnet faucet" chip.

This applies to both the Activity tab and the Recent activity list on Home.

## 2. All wallets becomes browsable, not just a total

Below the combined balance card, each wallet gets a row that can expand in place:

- Collapsed: name, short address, XRP balance, token count (as now).
- Expanded: the full asset list for that wallet (XRP plus every token with its issuer and balance), and Send and Receive buttons that act on that wallet directly.

Send and Receive from a wallet row open the existing dialogs already pointed at that wallet, so the "Which wallet?" picker is no longer the only route. The top-level Send and Receive buttons keep the picker for people who start there. The separate per-wallet "Tokens" panels stacked at the bottom go away, since that information now lives on the wallet it belongs to. Renaming stays on the row.

## 3. Confirm tokens actually appear

The screenshots show "0 tokens" everywhere, but the ten test wallets never held a token, so it is not yet confirmed whether token display is broken or simply empty. First step: on Testnet, add a trust line to a test issuer from one wallet, receive some of that token, then check that it shows on Home, in the Tokens tab, and in the expanded wallet row of the combined view. Anything that does not show gets fixed in the same pass. If it turns out display is fine, that is reported as-is with screenshots rather than changing code for the sake of it.

## Technical notes

- New helper in `src/ledgerly/ui/format.ts` (or a small `names.ts` beside it): `resolveName(address, accounts, contacts)` returning `{ name, kind: 'own' | 'contact' | null }`. Own wallets come from `state.accounts` (label plus address), contacts from `wallet.listContacts()`.
- `src/ledgerly/ui/views/Activity.tsx` loads contacts once via `useAsyncData` and passes both lists into the row renderer; headline becomes `${entry.headline} from/to ${name}` for Payments with a counterparty, unchanged for non-payment types. Same rendering is reused in the Recent activity panel of `src/ledgerly/ui/views/Dashboard.tsx` by extracting a shared `ActivityRow` component so the two lists cannot drift.
- No engine or protocol change: `HistoryEntry.counterparty` already carries the address, and naming is purely presentational.
- `AllWallets` in `src/ledgerly/ui/views/Dashboard.tsx` gains `expanded: string | null` state. The expanded body reuses the existing `AssetList` rendering, extracted so the single-wallet Home view and the expanded row share one component. Per-row Send and Receive set the existing `dialog` state directly.
- Trust line verification uses the existing `Tokens` tab add-trust-line flow against a Testnet issuer; the sandboxed test wallet and its phrase are destroyed after, as with previous QA runs.
