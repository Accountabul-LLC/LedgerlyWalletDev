# Track value sent across Ledgerly

Add a fourth public stat next to Wallets created, Transactions signed and People signing: the total US dollar value of payments signed through Ledgerly.

## What gets counted

- Mainnet only. Testnet and Devnet payments are practice money and are worth 0, so they add nothing to the total.
- XRP payments, priced at the live XRP/USD rate at the moment of signing.
- Stablecoin payments (RLUSD and USD-denominated issued tokens) counted at 1.00 USD each.
- Any other issued token still counts as a transaction signed, but adds 0 to the value total, because there is no trustworthy price for it.
- The exact converted dollar value is stored per payment, as chosen.

## What is still never stored

No address, no sender, no recipient, no token issuer, no profile id, no wallet id. A row is: kind, network, random browser key, dollar value. The public number stays a single grand total, never a list.

## Where the price comes from

The dollar value is calculated on the server, not in the browser, so the number cannot be inflated by editing what the page sends. The browser reports only the raw amount and asset; the server looks up the XRP price, converts, and writes the row. XRP price comes from a public price API, cached briefly so a burst of payments does not hammer it. If the price lookup fails, the payment is still counted as signed with 0 value rather than failing or blocking the send.

## Landing page

The stats strip becomes four items, with the new one shown as compact currency (for example `$1.2M`, `$48.3K`, `$412`). The privacy line under the strip is reworded from "We never record addresses, amounts or who signed what" to something accurate: totals only, no addresses, no recipients, and no way to tie a payment to a person.

## Technical notes

- Migration: add `usd_value numeric(20,2) not null default 0` to `public.platform_events`. Replace `public.platform_stats()` so it also returns `value_sent_usd`, summing `usd_value` where `kind = 'tx_signed'`. Keep the existing grants: EXECUTE for `anon` and `authenticated` on `platform_stats()` only.
- Tighten the anonymous INSERT policy on `platform_events` so a client cannot write an arbitrary `usd_value` (allow the existing anon insert only when `usd_value = 0`); valued rows are written by the server path.
- New `src/lib/metrics.functions.ts` with a public `createServerFn` that takes `{ network, amount, currency, issuer? }`, validates with Zod, prices server-side, and inserts through the admin client loaded inside the handler.
- New `src/lib/pricing.server.ts`: XRP/USD fetch with an in-handler cache and a stablecoin allowlist (RLUSD plus USD currency codes from known issuers), returning 0 for unknown assets.
- `src/ledgerly/ui/metrics.ts`: extend `PlatformStats` with `valueSentUsd`, and add a fire-and-forget `recordSignedPayment(...)` that calls the server function and never throws into the send flow.
- `src/ledgerly/ui/views/Send.tsx`: at the existing `recordPlatformEvent('tx_signed', ...)` call site, also report the signed amount and asset. Extension/approval signing paths keep the plain counter.
- `src/routes/index.tsx` and `src/ledgerly/ui/styles.css`: fourth stat tile plus compact currency formatting; grid adjusted so four tiles still fit on mobile.
- Readiness suite: extend the database policy test to assert the new column defaults to 0 and that anon cannot insert a non-zero value.
