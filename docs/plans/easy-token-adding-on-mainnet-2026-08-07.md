# Easy token adding on Mainnet

Today the only way to hold a new token is the "Add a trust line" dialog, where you type a currency code, an issuer address, and a limit by hand. That is fine for experts and unusable for everyone else. This plan adds a searchable token directory so people pick a token by name, see who issues it and how widely it is held, and add it in one confirm step.

## What people will see

1. On the Tokens tab (Mainnet only), a "Add token" button opens a token browser.
2. A search field with a default list of the most-held Mainnet tokens: logo, ticker, issuer name, holder count, and a short issuer address.
3. Selecting a token shows a confirmation card: full issuer address, holder count, whether the issuer is verified in the directory, and the reserve cost of the trust line (0.2 XRP). Limit is prefilled with a sensible default and stays editable under an "Advanced" toggle.
4. Confirm runs the exact same TrustSet review-and-sign flow that exists now, so signing stays in the worker and nothing changes about custody.
5. An "Enter details manually" link keeps the current expert path for tokens not in the directory.
6. Tokens already held are marked as added and cannot be double-added.
7. On Testnet and Devnet the directory is hidden with a short note that the directory covers Mainnet tokens only; manual entry still works there.

## Keeping the data correct and current

Token data comes from a public XRPL token index, cached in our own database so the app never depends on a third party being up at the moment someone taps search.

- Primary source: XRPScan's public token endpoint (verified reachable, returns code, issuer, holder counts, and issuer metadata).
- Secondary source: XRPLMeta, used to fill in logos, descriptions, and issuer links when present. It was unreachable during this check, so it is treated as best-effort enrichment, never a hard dependency.
- A refresh job pulls the top tokens by holder count on a schedule and upserts them into our table. Rows that disappear upstream are marked inactive rather than deleted, so nothing vanishes mid-session.
- Every row keeps the timestamp of its last successful refresh. The token browser shows "Updated <time>" so staleness is visible rather than silent.
- Search and listing read only from our table, so results are fast and stable.

## Safety rules

- Directory listing is not endorsement. Each token card shows holder count and issuer, and the existing warning about unverified issuers stays.
- Tokens with very low holder counts, or a ticker that matches a well known token from a different issuer, get a caution chip on the confirm card.
- The confirm card always shows the full issuer address in monospace so it can be compared against an outside source.

## Technical section

- New table `public.xrpl_tokens`: currency (hex or 3-char code), issuer, ticker, display name, issuer name, logo url, holder count, trust score, source, active flag, last_synced_at, created_at, updated_at. Unique on (currency, issuer). Read access granted to anon and authenticated (public reference data, no user data). Writes restricted to service role.
- Ingestion runs in a TanStack server route at `src/routes/api/public/tokens/sync.ts`, guarded by a generated `TOKEN_SYNC_SECRET` header check, scheduled with pg_cron against the stable project URL. It fetches, normalises, and upserts in one batch with the admin client.
- Read path is a `createServerFn` in `src/lib/tokens.functions.ts` (`searchTokens`, `listPopularTokens`) that queries the cached table with a trigram or ilike match, ordered by holder count, capped at 50 rows. Client uses TanStack Query with a long stale time.
- New UI component `src/ledgerly/ui/views/TokenDirectory.tsx`, opened from `Tokens.tsx`. Choosing a token calls the existing `TrustLineDialog` prepare path with currency, issuer, and limit prefilled, so `prepareTrustSet` and the worker signing flow are untouched.
- Currency normalisation helper shared by directory and manual entry: 3-character codes pass through, longer tickers convert to the 40-character hex form, hex input is accepted as-is.
- Held-token detection compares the directory rows against the account's existing trust lines already loaded in the portfolio state.
- Styling reuses the existing `.card`, `.row`, and dialog primitives so the browser matches the rest of the wallet.

## Out of scope for this pass

- Live price and value display for tokens (the directory stores metadata only for now).
- Automatic trust line removal or cleanup of unused lines.
