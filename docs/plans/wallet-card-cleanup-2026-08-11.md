# Wallet card cleanup

Three fixes, all in the shared wallet card template so every place that shows a wallet changes together.

## 1. Slimmer card header

New header layout inside `WalletCard`:

```text
Bill account                        [Testnet - Practice funds]
r3FvXKdf1w2eQ8p...5iKqmD   [copy] [hide]
```

- Wallet name on the left of the top row, network chip pinned to the top right corner.
- Second row: the full account address (monospace, wraps on narrow cards instead of truncating), with the copy button and the hide-sensitive-info (eye) button sitting right next to it.
- Removes the separate controls row, so the card gets shorter.
- Hidden mode still masks the address and balances.
- The individual wallet cards in the grid keep their rename (pencil) button in the same inline group, and gain the same eye toggle so all cards match.
- The "All wallets" total card has no address, so its address row is replaced by its one-line explainer while keeping the identical spacing.

## 2. Equal-size cards in the All wallets grid

The grid tiles differ in height today because notes, token counts and action sets vary. Fix in CSS:

- Grid items stretch to the tallest card in the row.
- Inside each card the header/balance/note block sits at the top and the action buttons plus explorer link are pinned to the bottom, so buttons line up across cards.
- Reserve a consistent line for the note so a card without one does not shrink.

## 3. One template everywhere

The single-wallet ("Bill account") card, the grid cards and the combined total all render from `WalletCard`, so after the header change they share the same type scale, padding, button row and footer link position.

## Technical notes

- `src/ledgerly/ui/components/WalletCard.tsx`: restructure the head into a title row (title + network chip) and an address row (address + inline actions); add an `address` prop rendered by the template rather than each caller passing a subtitle span.
- `src/ledgerly/ui/views/Dashboard.tsx`: update the three call sites to pass the full address and the hide toggle; keep the rename button for grid cards.
- `src/ledgerly/ui/styles.css`: rework `.wallet-card-head`, add equal-height rules to `.wallet-cards` / `.wallet-card`.
- Verify visually with a Playwright pass at desktop and narrow widths after the change.
