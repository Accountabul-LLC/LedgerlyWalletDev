# Codebase QA cleanup

The wallet code is in good shape overall. Shared concerns (address shortening, XRP amounts, copy buttons, dialogs, QR codes, password strength) already live in single modules and are reused correctly. The cleanup below is about dead weight and a few small duplicates.

## 1. Remove the unused component library (largest win)

`src/components/ui/` holds 46 stock UI files (~4,360 lines) that arrived with the starter template. Nothing outside that folder imports any of them; the wallet uses its own components in `src/ledgerly/ui/`.

Delete the whole folder, plus the two files that exist only to serve it:

- `src/hooks/use-mobile.tsx` (only used by `components/ui/sidebar.tsx`)
- `src/lib/utils.ts` (the `cn` helper, only used inside `components/ui/`)

If any of those stock pieces are wanted later, they can be re-added one at a time.

## 2. Remove the duplicate currency helper

`src/lib/xrpl-currency.ts` re-implements logic that already exists in the ledger core:

- `toDisplayTicker` duplicates `currencyToDisplay` in `core/xrpl/amount.ts`, but without its safety rule that hides fake "XRP" tokens.
- `toLedgerCurrency` / `isHexCurrency` duplicate `currencyToHex` / `isValidCurrencyCode`.
- Nothing imports any of those three; only `timeAgo` is used, by the token directory.

`timeAgo` also overlaps with `formatRelativeTime` in `src/ledgerly/ui/format.ts`.

Plan: point the token directory at the shared formatter and delete `src/lib/xrpl-currency.ts`. Keeping the core version as the single source matters here because it is the one with the lookalike-token protection.

## 3. Share the token badge label

The three-letter badge on a token row is written out by hand in four places (`Dashboard` twice, `Tokens`, and a private copy of the function inside `TokenDirectory`). Add one `tokenBadgeLabel()` helper to `src/ledgerly/ui/format.ts` and use it everywhere.

## 4. Share the explorer link builders

Six places build an explorer URL by gluing strings together, each wrapped in its own "does this network have an explorer" check (`Activity`, `Receive`, `Send`, `Dashboard` twice, `Activate`). Add `explorerTxUrl()` and `explorerAccountUrl()` next to the network definitions and call those instead.

## 5. Trim dead styles

These classes in `src/ledgerly/ui/styles.css` are defined but never applied anywhere: `.grid-two` (and its responsive variant), `.section-title`, `.select-plain`, `.unified-total`, `.unified-total-figure`, and the standalone `.copy-button` rule. Roughly 30 lines out.

## What is intentionally left alone

- `src/ledgerly/core/` stays as the mirror of the upstream wallet repo; no refactors land there beyond nothing at all in this pass.
- No orphaned routes, views, exports, or icons were found, and no stub or unreachable code paths turned up in the wallet views.

## Verification

Typecheck plus a click-through of the wallet dashboard, tokens, activity, send, receive, activation, and the signed-out pages, to confirm nothing referenced the deleted files.

Net effect: roughly 4,500 lines removed and four small helpers consolidated, with no user-visible change.
