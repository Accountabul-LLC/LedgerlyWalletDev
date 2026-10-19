# XRPL Wallet Directory: Download links + logos

Promote other XRPL-native wallets from Ledgerly. No sign-in with them yet, just discovery and download links, each with its own logo and a "coming soon" note about future sign-in.

## Wallets included

Established XRPL-native wallets:

- Joey Wallet — joeywallet.xyz (already integrated; button copy changes to "Download Joey Wallet" in promo spots)
- Xaman (formerly XUMM) — xaman.app
- Ledger (hardware, XRP support) — ledger.com
- D'CENT (hardware) — dcentwallet.com

If you want a different set, tell me and I will adjust before building.

## What gets built

1. A single source of truth: `src/ledgerly/ui/external/wallet-directory.ts` listing each wallet's name, tagline, official URL, platform (extension / mobile / hardware), and logo component.
2. Logos: one inline SVG mark per wallet added to `src/ledgerly/ui/components/icons.tsx`, in the same style as the existing Joey mark (currentColor or brand colour where needed). No network-loaded images.
3. A reusable `WalletDirectory` component rendering a responsive card grid. Each card: logo, wallet name, one-line description, platform chip, and a "Download &nbsp;" button opening the official site in a new tab (`noopener,noreferrer`). A single shared note under the grid: sign-in with these wallets is coming soon.
4. Placement:

- Landing page (`src/routes/index.tsx`): replace the single Joey feature card with the wallet directory section.
- Onboarding (`Onboarding.tsx`): "Get Joey Wallet" becomes a compact link into the directory alongside the download buttons.
- A dedicated route `/wallets` so the directory has its own page, linked from the landing section and footer, with its own head() metadata.

5. Copy change: promo buttons read "Download &nbsp;", not "Continue with".

## What stays unchanged

- actually since its not a true sign in option we can remove it Joey sign-in on `/auth`
- No new auth providers, no external signing, no database changes.

## Technical notes

- New files: `src/ledgerly/ui/external/wallet-directory.ts`, `src/ledgerly/ui/components/WalletDirectory.tsx`, `src/routes/wallets.tsx`.
- Edited: `icons.tsx` (new marks), `index.tsx`, `Onboarding.tsx`, `styles.css` (grid + card styles using existing Ledgerly tokens), footer link.
- All outbound links are hardcoded official https URLs, opened with `rel="noopener noreferrer"`; no user input feeds them.
- Verification: typecheck, the 154-test readiness suite, and a preview screenshot of `/wallets` and the landing section.
