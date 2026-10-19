# Native Android market and security follow-up — 2026-10-14

Status: implementation and independent security regressions passed; full vault-backed native QA and production release gates remain open. This is a follow-up to the cloud Android performance audit; the earlier native five-wallet import and isolated-signing release gates remain open.

## Implemented behavior

The wallet home and watch-only dashboard now include a compact XRPL market preview. A public native market route shows XRP and up to 20 issued tokens, with canonical issuer/currency identity, ticker, USD quote, 24-hour change, issuer context and visible clickable “Data by xrpl.to” attribution. Quotes and watch balances are explicitly separate; Mainnet market prices are labeled even when the wallet network differs.

Market data loads asynchronously through an injected public-data client with single-flight refresh, bounded persisted cache, cancellation, stale timestamps, offline fallback and Retry-After handling. Only focused foreground market views poll; manual taps, focus changes and failure retries share the same provider-specific minimum refresh interval. Anonymous reads use two documented provider endpoints every ten minutes; an approved configured proxy uses a one-minute refresh. No profile token, wallet address, mnemonic, password, signing API or provider key is sent to this service. Provider IDs are derived from validated issuer/currency, not names. MD5 is used only for the provider's public token identity scheme.

Navigation, Activity, contact, wallet and action icons use consistent local vector geometry and the existing Ledgerly palette. Activity now uses a virtualized list and deduplicates pagination by transaction hash. Native XRP uses the official unmodified black symbol; see `mobile/assets/branding/NOTICE.md`. The app mark stays Ledgerly's existing asset. Token avatars have fixed dimensions, bounded first-party raster URLs, memory/disk caching and neutral fallback icons.

## Provider configuration and permission

Authoritative sources checked on 2026-10-14:

- https://api.xrpl.to/v1/docs
- https://xrpl.to/docs
- https://xrpl.to/docs/terms
- https://xrpl.org/XRPL_Brand_Kit.zip

The provider requires visible clickable attribution on the same screen for every access tier. Anonymous allowance documented at this review was 333 calls/day, 30/minute and two/second, with a separate token-list endpoint limit. The lightweight list actually omits issued-token USD prices; the implementation uses a bounded full list and a separate native-XRP quote. The thumbnail endpoint requires a server API key. Cached redistribution through Ledgerly's own API requires written provider permission; the permission question remains unanswered, so the backend gate defaults closed.

To enable an approved first-party deployment, configure `XRPL_TO_REDISTRIBUTION_APPROVED=true` and `XRPL_TO_API_KEY` only in backend secret storage, and set mobile `EXPO_PUBLIC_MARKET_API_ORIGIN` to the deployed public HTTPS origin. Do not place the provider key in Expo public variables, image URLs, client bundles or logs. Without a configured origin, native display uses the documented anonymous API and local XRP / neutral issued-token symbols. This gives working market prices now; live issued-token logo delivery remains unverified until permission and the server key are supplied.

The proxy fixes upstream origin and paths, rejects redirects, streams JSON/image byte caps before parsing, accepts only bounded PNG/JPEG/WebP rasters, rejects SVG/HTML, caps concurrency and cache size and honors 429 backoff. Limits are per process; a distributed/edge budget is still required before scaling a public deployment. No provider account signup, external deployment or permission email was performed.

The genuine Stripe Directory CLI search failed with its server's invalid-user-agent response; official provider documentation was used as the fallback. No XRP wallet skill or Daybreak route was exposed in this session. Independent red and blue agents performed the available security exercise; this is not a claim of a Daybreak review.

## Android evidence

Environment: Android 10/API29 x86_64, Expo SDK57, software graphics, two virtual CPUs, 2 GiB guest RAM, no `/dev/kvm`. The owner-private screenshot viewer remains separate from the app backend and pauses during private screens. Raw provider datasets and screenshots are kept in the private cloud workspace, not redistributed in this repository.

- Live public market: XRP and issued-token prices and percentage changes rendered from the actual provider, with visible attribution, official XRP symbol and fallback issued-token icons. Price rows fit at 540×960 without overlap in the first viewport.
- Offline: provider CONNECT requests were deliberately rejected by the existing approved proxy bridge while the already loaded Android screen stayed open. Pull-to-refresh retained cached rows and showed “Saved prices” plus a reconnect message. The rejection was observed in the bridge; no network-policy bypass or weakened TLS was used. Connectivity was then restored.
- Scrolling: several swipes exposed further issued-token rows while attribution stayed visible in the fixed header. Android system night mode was enabled; the configured light UI remained readable. The app does not implement an alternate dark theme. A short software-emulator graphics sample recorded 45 frames, 41 flagged janky (91.11%), p50 77 ms and p90 150 ms; Expo Go PSS was 393,869 KiB. This confirms visible rendering, not smooth release-device performance. The final source bundle was reloaded in Expo Go. Persisted public quotes survived process restart; after the ten-minute cache interval elapsed, the blocked provider refresh again showed the saved-price reconnect message. This validates the final native market bundle, not vault-backed screens. An actual `/send` deep link redirected to the password Unlock screen while locked; the public market route did not grant access to sending. The screenshot guard refused capture of the empty password form, and the viewer stayed paused throughout.

## Security tracking

The accompanying JSON tracker records all 11 independent findings, synthetic reproductions, blue fixes and regression results. Forty-five focused tests passed independently; the full suite passed 255 tests in 32 files. Web build, web/mobile TypeScript checks, changed-source ESLint and the Android Hermes export passed. Private material was neither accessed nor copied by the reviewers; no live attack or payment was submitted. The mirrored wallet core and its cryptographic parameters remain unchanged.

Native vault import previously failed to complete in a ten-minute software-emulator run. Dashboard, asset history, sending, receiving and Settings behind a restored vault cannot yet be claimed as a completed native end-to-end sweep. Source changes and synthetic host regressions are recorded separately from actual Android evidence. The shared JavaScript signing heap remains the documented production-release prerequisite, regardless of these fixes.

A failed mirrored-engine network preference write can still leave its display and connection different. The native host now blocks preparation and confirmation while they differ; a successful explicit network selection restores consistency. It also serializes network mutations, invalidates old approvals on context changes, consumes each confirmation once, synchronizes the connection when hiding Testnet changes the visible fallback, and locks on profile SIGNED_OUT. These are native safeguards, not a claim that the upstream failure behavior was rewritten.

The durable generation store assumes individual SecureStore/AsyncStorage item writes are atomic. Actual implementation tests inject failures at staged writes, preserve the old complete ciphertext, exercise legacy reads and cleanup, and serialize secure-session migration with logout. This does not establish behavior during a real OS crash or reboot.

## Main integration verification

The full native dependency chain was checked against `main` at `6dabe380c9691794aa2bdf1f922b7eafed61f3d7`. The current Android dependency head `3a046fbf6929ac287e5926d95a74ba4694f3d7ae` was integrated by merge, including its test-runner TypeScript configuration. The resulting source passed 255 repository tests, 23 development-app tests, root and both native TypeScript checks, and the production web build. The 11 findings remain addressed within the documented native scope. Native application source matches the previously exported and emulator-verified implementation. No native binary release is authorized by these test results; provider credentials/permission, isolated signing and full physical-device validation remain outstanding.
