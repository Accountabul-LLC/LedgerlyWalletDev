# Multi-wallet switcher and unified view

## What you get

1. The account dropdown stops using the browser's native menu and matches the network pill: rounded card, hover states, the wallet name with its short address, and a check on the active one.
2. A footer inside that dropdown with **Add a wallet** and **Import an existing wallet**, so a second wallet is one click away instead of buried in Settings.
3. **All wallets** at the top of the dropdown. Choosing it turns Home into a combined view: one total across every wallet, plus a per-wallet breakdown you can click to jump into a single wallet.
4. Adding a wallet creates a new address from the recovery phrase you already backed up, so nothing new to write down. Importing a separate seed stays available as the secondary option.

## Behaviour details

- Send and Receive always act on one wallet. In All wallets mode those buttons ask which wallet first, then open the existing dialogs unchanged.
- The combined total shows the sum of XRP balances on the current network, plus the count of wallets included. Tokens are listed per wallet, not merged, so an issuer is never hidden behind a shared ticker.
- Wallets that are not activated on the current network show as "Not activated yet" and count as zero.
- All wallets mode is a view preference only. The wallet engine keeps a single active account, so approvals, signing, and site permissions are untouched.
- Activity and Assets tabs stay tied to the active wallet.

## Technical notes

- New `AccountMenu` component in `src/ledgerly/ui/App.tsx`, modelled on the existing `NetworkMenu`: click-outside and Escape handling, `role="listbox"`, and shared menu styling extracted in `src/ledgerly/ui/styles.css` (generalise `.network-menu*` into reusable `.menu*` classes, keep the network pill variants). The `select.select-plain` in `TopBar` is removed.
- View mode lives in React state in `src/ledgerly/ui/App.tsx` (`'single' | 'all'`) and is passed to `Dashboard`. No protocol or engine changes.
- New `AllWalletsPanel` in `src/ledgerly/ui/views/Dashboard.tsx` fetches `wallet.getPortfolio({ accountId })` for each account in `state.accounts` via `Promise.allSettled`, keyed on `state.network.id` so switching networks refetches. Failures render as "Could not load" on that row only.
- Sums use `addDrops` on drop strings from `@ledgerly/core` money helpers, never `Number`. `addDrops` is exported from the shared entry point if it is not already.
- Add and import reuse the existing `wallet.addAccount` and `wallet.importAccount` dialogs already implemented in `src/ledgerly/ui/views/Settings.tsx`; those dialog components move into a shared module so both Settings and the new menu render the same flow.
- The eye toggle keeps masking balances and addresses in the combined view.
