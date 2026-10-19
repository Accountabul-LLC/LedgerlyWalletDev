# One clear Send flow: pick wallet, pick asset, scan or paste, confirm

## What changes for you

Send becomes a single guided flow, no matter where you start it from (top Send button, a wallet card, or the unified view):

1. **Wallet** - a dropdown listing every wallet by name plus its short address and XRP balance. If you opened Send from a specific wallet card, that wallet is preselected, and you can still change it here.
2. **Asset** - the list refreshes to only the assets actually held in the selected wallet: XRP plus each token with its balance. Switching wallets resets the asset to XRP so you never send from a stale selection.
3. **Recipient** - paste an address, tap a saved contact, or use the new **Scan QR** button. Scanning opens the camera in the dialog, reads a plain address or an XRPL payment URI, and fills in the address (and destination tag if the code carries one). If the camera is unavailable or blocked, you get a clear message and the field stays typable.
4. **Amount and destination tag** - as today, with the available balance shown under the amount.
5. **Review** - the existing review screen with fee, total, and risk findings.
6. **Final confirmation** - on Mainnet, confirming opens one last prompt: this is a real transaction with real value, it cannot be reversed, showing amount, asset, and recipient. You confirm there before anything is signed. On Testnet and Devnet that prompt says the funds are test-only, so the habit is the same without the false alarm.

## Technical notes

- `src/ledgerly/ui/views/Send.tsx`: add an optional `accountId` (defaults to the active account) and an account `SelectField` at the top of `ComposeStage`. Wallet options come from `state.accounts`; per-wallet portfolios are needed for the asset list, so the dialog fetches the selected wallet's portfolio via the existing wallet API when it differs from the passed-in `portfolio`, keeping a small cache keyed by account id. Changing the wallet resets `asset` to `XRP`.
- Callers in `src/ledgerly/ui/views/Dashboard.tsx` keep passing their `accountId`/`portfolio`; the "Which wallet?" picker step before Send becomes unnecessary and is removed in favour of the in-dialog selector (Receive keeps its picker).
- QR scanning: new `src/ledgerly/ui/components/QrScanner.tsx` using `getUserMedia` plus the `Decoder` from the already-installed `@nuintun/qrcode`, decoding frames off a `<canvas>` on an animation loop, stopping all tracks on unmount. Parser accepts a bare `r...`/`X...` address and `xrpl:`/`ripple:` URIs with `?dt=` / `?amount=`; validated with the existing `isValidAddress` before it is accepted.
- Final confirmation: a `confirm` sub-stage inside `ReviewStage` rendered as a `Callout`-based confirm step (tone `danger` on Mainnet, `caution` otherwise), gating the existing `wallet.confirmPrepared` call. Network comes from `state.network`.
- Styles for the scanner viewport and the wallet-select row go in `src/ledgerly/ui/styles.css` using existing tokens. No engine or core changes.
