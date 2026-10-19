# Native market UI and red/blue follow-up

## Specification and ownership

Continue the measured five-wallet work in `apps/mobile` using the existing API36 emulator and
retained private test profile. Reuse the existing shared market normalizer/client and first-party
proxy from the reviewed production shell. Add native Home quotes, a virtualized discovery list,
local vector navigation/transaction icons and official XRP identification. No custom rankings,
trading, new provider accounts, signing-gate bypass, remote SVG, or production deployment.

Acceptance: public quotes show ticker, issuer identity, USD price, 24-hour change, visible clickable
attribution and cache/error state; wallet network/holdings remain separate. Market code receives no
wallet or auth inputs. Red findings must have synthetic reproductions, blue fixes and regressions.
Run native/root checks and inspect rendered screens on the existing visible emulator. Record build
and access failures honestly; source implementation does not establish installed-release QA.

## Provider and branding decisions

Verified [XRPL.to API documentation](https://xrpl.to/docs/tools/get-docs) on 2026-10-14. Anonymous
read endpoints are supported; a key is not required for initial prices. Attribution is required on
the same screen. Re-serving data/logos through a backend requires written permission. The user
confirmed no key/permission yet and selected anonymous prices with local/fallback icons. The
existing proxy stays gated rather than inventing approval or putting credentials in the APK.

The anonymous adapter makes two fixed-origin read requests at most every ten minutes, including
manual refresh/failure throttling, and respects 429 backoff. Quotes are public SQLite cache data;
background/unmount aborts requests. The keyed path uses only a configured first-party HTTPS origin.
Identity is validated currency plus issuer, not ticker or provider-supplied arbitrary URL. Images
use fixed sizes, memory/disk caching and neutral fallback icons; provider SVG is never executed.

The [official XRPL website](https://xrpl.org/about) links the
[XRPL brand kit](https://xrpl.org/XRPL_Brand_Kit.zip). Local XRP geometry is unchanged from the
existing verified official asset; `apps/mobile/assets/branding/NOTICE.md` retains provenance,
clear-space/size guidance and trademark constraints. No general open-source license is claimed.
The Ledgerly application emblem remains distinct from XRP and Ripple corporate marks.

Stripe Directory was consulted first, but no CLI was available and its documentation endpoint
returned an unsupported-content response. Official provider sources were used as the fallback.
The installed wallet skills are Access Lockdown and Payment Integrity. No separate XRP skill or
Daybreak subagent route was exposed; inherited-model red/blue reviewers were used, not Daybreak.

## Changes

- `MarketPanel`: five-row Home preview and bounded virtualized discovery list with timestamp,
  offline/error status, Mainnet/USD context and attribution.
- `market`: shared public-data client, native foreground lifecycle and SQLite caching.
- `TokenAvatar` / `icons`: official local XRP, safe first-party raster path when configured,
  neutral token fallbacks, consistent local vectors. Navigation, actions and Activity use icons;
  green/purple Activity decorations are removed.
- Runtime/auth hardening, initial-creation single-flight and funding race guards are tracked in
  [the red/blue findings report](../security/2026-10-14-native-red-blue.md).
- Public-key preflight is wired into both native packages' npm start/run/export hooks and EAS
  post-install; direct CLI builds must invoke it explicitly from the target app directory.
- Production KDF scheduling preserves parameters/output while yielding real timers at bounded
  intervals, including RN's microtask-backed `setImmediate`; Windows scheduling test now passes.

## Verification and open gates

Initial integrated checks: repository **257/257**, Dev **52/52**, root/Dev TypeScript, scoped lint
and the production web build passed. Production Expo dependency installation restored missing
`expo-image`; the normal Expo generator refreshed stale `/market` declarations, after which its
TypeScript passed. No public provider dataset, private credential or recovery backup is committed.

The new standalone Android release build is currently blocked before compilation by Java NIO's
Windows AF_UNIX loopback failure. IPv4 preference, short temporary paths, no-daemon and the normal
desktop-shell launch did not resolve it. A matching
[Codex Windows issue](https://github.com/openai/codex/issues/40902) reports the same symptom; that
report supports a tooling diagnosis but does not prove the exact local cause. The prior verified
release APK and five-wallet data are retained. Updated native UI checks use Expo Go 57 in the same
emulator and must not be represented as a rebuilt standalone APK.

Supabase security-advisor and read-only public-schema metadata calls for the documented project
were denied by the connector. Live database/RLS/grant checks therefore remain unverified. The
existing Bun readiness wrapper cannot run because Bun is unavailable; individually executed checks
do not imply the entire wrapper or vulnerability scan ran.

Dependency audit found 16 high transitive entries in Dev derived from two pre-existing advisories
(braces 3.0.3, node-forge 1.4.0). Official registry checks found no published compatible patches.
The new vector/image packages are not themselves flagged. Do not force an Expo downgrade; retain
the dependency/code-signing release gate. Production native signing isolation, native Send Testnet
QA, physical-device battery/smoothness and distributed public-proxy budgets remain open.

## Rendered QA and merge verification

The updated public market rendered actual XRP and issued-token rows on API36/x86_64 in Expo Go57,
with official local XRP artwork, neutral issued-token fallbacks, issuer identity, USD quote,
24-hour change, timestamp and clickable attribution. A local ignored screenshot is retained for
the user, not published as a provider dataset. The initial unavailable-price screen and its empty
state also rendered correctly. No injected prices or fake holdings were presented as live data.

The emulator reached Metro but failed external HTTPS. A temporary loopback-only CONNECT tunnel
restricted to the documented provider, Supabase and existing XRPL endpoints restored profile
sign-in and market reads. TLS remains end-to-end; no request bodies, keys or credential values are
logged. This is test transport, not the redistribution proxy or a production app dependency. The
standalone five-wallet vault and backups were not replaced or deleted. Expo Go's slow local unlock
and the standalone build blocker prevent a completed private-screen visual sweep of these changes.
Enlarged-font, offline-cache, theme and post-scheduler device timing remain unverified in this pass;
earlier five-wallet/private-screen evidence is not relabeled as evidence for the new UI.

After the final scheduler and auth changes, repository tests passed **258/258** and Dev tests
passed **58/58**. During merge preparation a later concurrent run experienced two test timeouts
and worker RPC timeouts, alongside unusually long host process delays. It is excluded as a timing
benchmark; the final serial rerun passed **258/258** without weakening assertions or crypto costs.
Root, Dev and production TypeScript and changed-source lint passed. The web build and Android
Hermes export are verified separately from the blocked new standalone APK. The normal Dev entry
remains the actual application, not a synthetic fixture. The shared bounded scheduler retains
byte compatibility and timer progress under RN-style microtask immediates.
