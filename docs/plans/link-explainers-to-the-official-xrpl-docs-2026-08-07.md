# Link explainers to the official XRPL docs

Every place the wallet explains how the XRP Ledger works keeps one short sentence in Ledgerly's voice, then sends people to the official page on xrpl.org for the full detail. That way the wallet never becomes the source of truth for ledger rules, and the guidance stays correct as the ledger changes.

## What changes

A small "Learn more on XRPL.org" link is added under these notes, each pointing at the matching official page:

- **Trust lines** (Assets tab, the note you selected) - keeps one sentence about holding a token from one issuer up to a limit, then links to the XRPL trust lines and tokens page.
- **Token directory note** (Assets tab on test networks) - links to the tokens overview page.
- **Account activation and reserve** (the "Activate this account" card and the testnet faucet card) - links to the XRPL reserves page.
- **Balance card reserve wording** (Spendable and Reserved) - the Assets tab reserve line links to the reserves page.
- **Destination tags** (Send and Receive) - links to the XRPL source and destination tags page.
- **Recovery phrase and key safety** (Settings) - keeps Ledgerly's own safety wording, since that is about this wallet, and adds a link to the XRPL accounts and keys page for background.

Wording stays plain, short, and free of em dashes. Existing copy is trimmed where the linked page already covers the detail.

## Link behaviour

Links open in a new tab through the wallet's existing external-link handler, so the behaviour matches the current "View on explorer" links and works the same in the browser build and the extension build. Each link carries clear text such as "Read about trust lines on XRPL.org" rather than a bare URL.

## Technical notes

- New shared module `src/ledgerly/ui/docs.ts` holds the XRPL doc URLs in one place (trust lines, tokens, reserves, destination tags, accounts and keys), so future pages are added or corrected in a single file.
- A small `DocLink` component is added to `src/ledgerly/ui/components/primitives.tsx`, styled like the existing `link-button`, calling `openExternal` from the wallet context.
- Views touched: `views/Tokens.tsx`, `views/Dashboard.tsx`, `views/Send.tsx`, `views/Receive.tsx`, `views/Settings.tsx`.
- One style rule added in `src/ledgerly/ui/styles.css` for spacing of a doc link inside a callout or card note.
- No engine, wallet, or key-handling logic changes. Presentation only.
