# Homepage XRPL token ticker

The homepage shows a moving XRP Ledger market strip immediately below
`SiteHeader`. Data comes directly from XRPL.to: 50 entries, comprising native XRP
and the top 49 issued tokens ranked by 24-hour XRP trading volume. Invalid
identities are rejected; missing or stale prices show a dash without removing entries.
The ticker does not use CoinGecko or a curated cross-chain coin category.

## Data flow

`TokenTicker` → anonymous browser GETs to `https://api.xrpl.to/v1/tokens?limit=50&sort=vol24hxrp`
and `https://api.xrpl.to/v1/token/XRP` → shared XRPL identity normalization → ticker.

The browser requests omit cookies, authorization, API keys and referrers, reject
redirects and bypass the HTTP cache. There is no ticker server endpoint,
price redistribution proxy, persistent storage or remote script. Only
public market data lives in React Query's temporary memory. The existing gated
native/server xrpl.to integration is unchanged. Keys are not needed for these
public price endpoints.

XRP uses the existing official symbol, with provenance retained in
`src/assets/tokens/NOTICE.md`. Issued-token logos use the public
[XRPL Meta API](https://xrplmeta.org/): anonymous browser GETs to
`https://s1.xrplmeta.org/v2/token/{currency}:{issuer}`. The response must match
both currency and issuer; only raster icon URLs on `s1.xrplmeta.org` and
`s2.xrplmeta.org` under `/icon/` are accepted. No provider key or server logo
proxy is needed. The existing gated XRPL.to server integration is unchanged.

React Query shares metadata reads between both track copies, with at most three
requests in flight. Responses are bounded by the shared JSON reader (1 MiB).
Metadata remains fresh for 24 hours in temporary memory. Image requests use
anonymous CORS and omit referrers. Missing, blocked or undecodable
logos retain a colored two-letter fallback. Fixed dimensions prevent layout shifts;
logos are decorative because the adjacent symbol already names the token. A logo
is not a verification mark. Prices continue independently if logos fail.

`normalizeMarketPayload` checks the issuer, exact currency and canonical md5
identity. Symbols are labels, never identifiers or inputs for wallet valuation.
The displayed price uses `usd`. Issued-token `pro24h` describes the token/XRP
return, while native XRP's `pro24h` describes XRP/USD. The ticker composes those
returns for a USD-based daily change:

`usdChange = ((1 + tokenChange / 100) * (1 + xrpChange / 100) - 1) * 100`

XRP itself retains its native daily change. Missing or stale XRP baselines produce
an unavailable change, never an assumed zero. Invalid prices and quotes
older than 30 minutes show a dash. Tiny prices retain up to eight decimals;
smaller values display `<$0.00000001`.

Requests refresh every five minutes while visible, are bounded to 1 MiB each and
abort after eight seconds. HTTP 429 honors Retry-After with a shared cooldown
that also covers focus-triggered refetches. Loading, failure and expiration states
do not invent prices. Recent retained quotes are labeled last available after a
failed refresh. Browser CORS/provider availability is required; there is no silent
provider fallback. Visible attribution links to https://xrpl.to on the same strip.

## Motion and accessibility

The quote list scrolls continuously with a visually duplicated track. The copy is
aria-hidden and inert. It starts moving automatically, including when the browser
requests reduced motion, per the user's explicit requirement. Hover does not stop
it. A pause/resume button and keyboard focus can pause movement. The clipped strip
never exposes a scrollbar, including while paused. Duration scales with the number
of quotes for a steady news-ticker pace. Signs distinguish gains and losses independently of color. Quote links
use validated md5 identities and opener-safe external links to XRPL.to.

## Verification

Top-50 motion verification on October 14, 2026: the live browser contained exactly
50 quote entries, reported `animation-play-state: running`, and moved from
`translateX(-381.75px)` to `translateX(-560.482px)` between observations. Its viewport
reported `overflow-x: hidden` and `scrollbar-width: none`. The check succeeded after
honoring XRPL.to's endpoint rate-limit cooldown. All 38 scoped ticker/market/proxy/
fingerprint/token-sync tests passed after integrating current main, as did web
and dev-mobile types, scoped lint, the production build and client-secret scan.

`tests/readiness/39-token-ticker.test.ts` covers USD-return composition, tiny prices,
identity validation, freshness, missing baselines, rendering/attribution, anonymous
request settings, response limits and rate-limit cooldown. Run it alongside
`tests/readiness/28-market-client.test.ts`, then types, scoped lint and a build.
Inspect the live browser separately: successful shell requests alone do not prove
CORS works from the app.

Replacement verification on October 14, 2026: browser requests to both XRPL.to
endpoints returned HTTP 200 and the strip displayed 16 fresh assets, including
XRP, RLUSD, USDC, FUZZY, BCHAMP and PHNIX. Attribution and links reference XRPL.to.
The removed local ticker API returns HTTP 404. After merging current main into
the feature branch, all 23 scoped ticker/market/fingerprint/report tests passed,
along with types, scoped lint, production build and the client-secret scan.

The prior implementation's full suite passed 306/308 before its generated
fingerprint was refreshed. Fingerprint checks then passed. The existing native
Argon2 scheduling test exceeded this machine's 30-second gate and passed separately
in 47 seconds with a diagnostic 90-second timeout. That gate and its assertions
remain unchanged. The audit generator names reports using UTC dates.

Provider contracts: [token list](https://xrpl.to/docs/tokens/get-tokens),
[token details](https://xrpl.to/docs/token/get-token-id),
[API keys](https://xrpl.to/docs/api-keys), and
[field dictionary](https://api.xrpl.to/v1/docs).

Icon verification on October 15, 2026: both provider endpoints returned HTTP 200
in the browser, with 50 entries and 50 icon badges in the primary track. The XRP
SVG loaded at 24 by 20.47 pixels and the animation was running. Ticker and audit
fingerprint tests passed (12/12), as did web types, scoped lint, production build
and the client-secret scan. The repository transfer preserved the existing PR.

Public logo browser verification: 36 issued-token logos loaded successfully,
including RLUSD, USDC, FUZZY, BCHAMP, ETH, ARMY and PHNIX, plus the local XRP
symbol. All 50 price entries remain in the strip; 13 tokens use fallback badges.
For example, EVR's matching metadata contains no token icon. The animation runs
with hidden overflow and no broken images. Provider outages preserve the same
fallback path without disabling prices. No credentials were added or required.
The 30 scoped ticker, metadata/logo, proxy and fingerprint tests passed, along
with TypeScript, scoped lint, production build and the client-secret scan.
