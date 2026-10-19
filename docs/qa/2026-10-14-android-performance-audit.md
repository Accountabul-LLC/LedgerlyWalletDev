# Android performance and five-wallet audit

Status: measured Ledgerly Dev optimizations and five-wallet device scenario verified. Physical-device battery/smoothness, exact splash/TTFD instrumentation, production-candidate integration, and native Send isolation remain open.

## Scope and acceptance criteria

Use the existing `emulator-5554`, not a second emulator. Keep its browser mirror visible. The installed sandbox is `com.accountabul.ledgerly.dev` from `apps/mobile`; `mobile` is a separate production candidate. Preserve existing working code and privately verified test-wallet backups.

The primary scenario is one verified disposable Ledgerly profile managing five independently recoverable XRPL Testnet wallets, labeled Wallet 1–5. Different addresses derived from one phrase are not a substitute for five independent recovery records. Exercise both creation and the supported import flow, individually fund each address through Testnet, verify per-wallet/aggregate balances in integer drops, switch accounts, and test transfers using fake funds only. Test app process death, emulator restart, background locking, network loss/recovery, and persistence/address identity. Profile large histories with synthetic fixtures, separately from actual ledger history; do not fabricate ledger transactions or present fixtures as live results.

Record cold process launch, warm activity recreation, and hot retained-activity resume separately. Distinguish Android first display from splash removal, usable UI, wallet unlock, and completed network data. Record sample count, individual samples, median/tail values, build type, refresh rate, host/emulator resources, and observation overhead. Compare like-for-like one-wallet and five-wallet cases separately. Debug results are not release benchmarks. Emulator battery estimates are not physical battery-life measurements.

Measure navigation/button latency, frame deadlines/jank, UI-thread blocking, app PSS/CPU, connection/balance/history timing, background work, and repeated usage memory trends. Preserve crypto parameters, password normalization, key derivation/address compatibility, foreground locking, backup gates, and transaction review. Rank measured bottlenecks, fix only supported causes, rerun the same workload, and use results to choose the next change. Stop iterating when changes cease to produce repeatable improvement, not because a single sample looks faster.

## Credentials and cleanup

Reuse the already verified disposable profile. Its credentials and existing test phrases are restricted local files outside Git; never print their values. Retain separately recoverable credentials for each added wallet, verify private backups, and record only public addresses/labels in this report. Avoid heap dumps, recovery screenshots, plaintext UI dumps, credential-bearing URLs, broad logcat capture, and network-body logging. Diagnostic counters may be reset; wallet/app data must not be cleared merely to measure cold launch.

Cleanup is a separate final step after persistence/recovery and audit results are verified. Identify exact disposable records before removing them. Do not destroy the previously retained recovery backups or real-phone data under an ambiguous cleanup instruction. Self-custody ledger accounts cannot be erased by removing local app records.

## Initial observations

- Existing ADB device: Android 16, `x86_64`, 3,048,396 KiB guest RAM; 540×1200 at density 210 and an actual 30 Hz display.
- Baseline app: version 1.0.1, debuggable; native host uses OpenGL. The disposable profile was already verified. The final installed app is a standalone non-debuggable release with all five wallets.
- Existing native KDF/restore and Testnet-transfer evidence is in `2026-10-13-local-android-emulator.md`; those samples do not substitute for this controlled audit.
- Initial functional gap: the shared engine supported independent phrase-backed wallets, but the Dev shell lacked add/import management. This audit added and exercised those phone flows; the separate production shell still needs integration.
- Existing cumulative graphics counters span previous testing and are excluded from controlled before/after comparisons. Reset counters before each named workload; respect the actual 33.33 ms display period.

## Before/after measurements

| Workload / metric                   | Before                                                      | After                                                               | Evidence / limitation                                                          |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Debug cold launch / first display   | One wallet: median 4,873 ms                                 | Five wallets: median 3,017 ms                                       | Different wallet counts; context only, not a matched speedup                   |
| Debug warm activity recreation      | One wallet: median 281 ms                                   | Five wallets: median 348 ms                                         | Android reported WARM; different wallet counts                                 |
| Debug hot resume                    | One wallet: median 275 ms                                   | Five wallets: median 157 ms                                         | Android reported HOT; different wallet counts                                  |
| Unlock, one wallet                  | CPU trace: SHA self CPU about 2,442 ms                      | About 21 ms SHA self CPU                                            | Sampled method CPU; no matched wall-time claim                                 |
| Unlock, five independent wallets    | Median 34,631 ms                                            | Median 7,752 ms debug; 8,335 ms release                             | Matched debug comparison below; observation overhead included                  |
| Per-wallet / aggregate XRP          | One wallet verified                                         | Five verified; 499.999928 XRP final total                           | Independent phrase backups, faucet funding, fees and persistence checked       |
| Screen transition / frame deadlines | Synthetic debug scroll median-frame samples 61 / 61 / 61 ms | 57 / 53 / 46 ms; worse initial tail/jank                            | Detailed scroll and release tables below; raw button latency not instrumented  |
| XRPL connection / balance / history | No matched Android baseline                                 | Host SDK samples below                                              | Host network observations must not be labeled Android speedups                 |
| App PSS / CPU / background work     | Five-wallet debug unlock median 25.33 CPU seconds           | 2.29 CPU seconds; release background sample 0 ticks over 10 seconds | App CPU counters; matched unlock details below                                 |
| Release-equivalent performance      | No prior release baseline                                   | First display median 1,006 ms; loaded PSS median 112,280 KiB        | Standalone, non-debuggable, x86_64, locally debug-signed; no store publication |

### Matched five-wallet crypto comparison

The same installed debug app, five-wallet encrypted vault, password, addresses, Testnet endpoint, emulator resources, and visible mirror were used. The controlled baseline temporarily selected the original BIP39 helper in Metro; Argon2id stayed native with unchanged parameters in both cases. The native resolver was restored after measurement. No wallet data was cleared. Each sample starts with a cold app process; password-entry time is excluded. The endpoint is Home with all five live balances, not merely a dismissed splash.

| Metric (three samples)                           | Original BIP39                  | Native BIP39                    | Interpretation                                                                                                  |
| ------------------------------------------------ | ------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Unlock → loaded five-wallet Home, observed       | 33,649 / 34,631 / 35,543 ms     | 7,869 / 7,752 / 7,000 ms        | Median 34,631 → 7,752 ms; 77.6% less observed waiting. Includes ADB/UIAutomator overhead.                       |
| App CPU during observed unlock                   | 2,432 / 2,533 / 2,619 ticks     | 235 / 229 / 199 ticks           | `CLK_TCK=100`; median 25.33 → 2.29 CPU seconds, 91.0% less CPU work.                                            |
| Loaded app PSS                                   | 284,009 / 284,076 / 284,904 KiB | 281,670 / 282,580 / 281,996 KiB | Small memory change; hashing optimization primarily reduces CPU/waiting.                                        |
| Fresh graphics counters: janky / rendered frames | 19/859, 20/888, 22/916          | 10/97, 12/95, 8/81              | Different spinner durations change denominators. These percentages are not a fair scroll-smoothness comparison. |

Five-wallet optimized locked-screen launches separately reported COLD first display 2,830 / 4,129 / 3,017 ms; WARM recreation 382 / 231 / 348 ms; HOT resume 157 / 212 / 103 ms. These are additional context, not a matched one-wallet startup speedup. Exact splash removal and physical-device TTFD are not instrumented.

### Large-history feedback loop

An opt-in local entry rendered the actual Activity component with 1,000 synthetic records. It has no login, vault, signing, or network access and is labeled on screen. The regular entry was restored after tests. One warmup is excluded; each measured sample launches a new process and performs eight identical swipes. The accessibility probe could not reliably dump the large initial hierarchy, so both successful comparisons used in-memory screenshots: the presence of both synthetic direction-badge colors identifies a rendered record frame. Images were not persisted. This observation includes process launch and frame-capture overhead; it is not a standalone API latency.

| Metric                                 | All rows in ScrollView          | Virtualized FlatList            | Result                                                                                                     |
| -------------------------------------- | ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fixture records visible, three samples | 46,957 / 84,492 / 69,492 ms     | 11,915 / 19,178 / 20,792 ms     | Median 69,492 → 19,178 ms; 72.4% less observed waiting. Debug results are variable.                        |
| PSS after scrolling                    | 448,305 / 447,660 / 453,804 KiB | 258,691 / 246,811 / 243,745 KiB | Median about 438 → 241 MiB, 44.9% less app memory.                                                         |
| Native view count                      | 7,020 / 7,024 / 7,020           | 624 / 453 / 452                 | Rendering is bounded to the list window rather than all 1,000 rows.                                        |
| Scroll-only median frame duration      | 61 / 61 / 61 ms                 | 57 / 53 / 46 ms                 | Startup excluded; median improves, but tail/jank require further work.                                     |
| Scroll-only 95th percentile            | 93 / 89 / 101 ms                | 150 / 113 / 97 ms               | Initial virtualized debug tail is worse; do not claim all scrolling improved.                              |
| Scroll-only modern jank rate           | 7.89 / 5.74 / 8.80%             | 17.70 / 11.81 / 14.53%          | Debug virtualization trades initial memory/loading for dynamic row work. Release verification is required. |

A CPU-only scroll trace sampled roughly 10.37 seconds in `unstable_now`, 7.30 seconds in React `createTask`, 1.49 seconds in native `createNode`, and 1.02 seconds in repeated date formatting. This supports distinguishing debug overhead from production behavior. A smaller four-row batch plus cached dates produced inconsistent scroll results (24.11 / 17.43 / 15.04% jank); the batch change was rejected. The final list retains 12-row batches and caches one locale/time-zone formatter per mounted Activity screen, with malformed-date handling tested. The first table's virtualization measurements precede the final date-cache change; no unmeasured date-cache speedup is claimed.

### Five-wallet integration evidence

| Label    | Public Testnet address             | Recovery source                                           |
| -------- | ---------------------------------- | --------------------------------------------------------- |
| Wallet 1 | rnD4hp98yng4NDKRjEqJB7aKmoz7kZAtpR | Previously created/restored independent phrase            |
| Wallet 2 | racE9LYJ3f4ng14vAUVZYZkd8ZoVcY915Y | New independent phrase through the phone UI               |
| Wallet 3 | rnH8coaA9ySTGY2sGiwc7KhSPcHeUuVey7 | New independent phrase through the phone UI               |
| Wallet 4 | rBcZLgg6NLNZ8Wsr8XDDpkAKbuQoovzo6u | New independent phrase through the phone UI               |
| Wallet 5 | rGR7y9ZRGnwhzkd5d9vEiUXUMzwvwUe78s | Existing independent phrase imported through the phone UI |

All five encrypted records were independently decrypted in the restricted local test folder; every phrase matched its retained backup, passed BIP39 validation, and independently derived its stored public address. There are five distinct recovery phrases, not five derivation indices from one phrase. Forced process restarts and an Android reboot restored the five-wallet dashboard. Android System UI temporarily hung during reboot; that boot interval is excluded from app metrics.

The faucet originally accepted Wallet 2 funding before its validated balance was visible, leaving 0 XRP until manual refresh. The native adapter now submits once and waits for a validated balance increase, stopping on lock/network change. Wallets 3 and 4 showed 100 XRP after 11,698 and 9,382 observed milliseconds; Wallet 5's explicit faucet top-up showed 101.499988 XRP after 14,925 ms. Those times include faucet consensus, refreshed portfolio data and UI observation. Wallet 1 had prior faucet funding. The final on-screen total is **499,999,928 drops = 499.999928 XRP**, consistent with five 100-XRP faucet fundings minus 72 drops in previously validated transfer fees.

The host SDK harness sent five fake-fund payments: Wallet 2 → 3 (1 XRP), 3 → 4 (1 XRP), 4 → 5 (1 XRP), 5 → 1 (0.5 XRP), and 1 → 2 (0.5 XRP). Every payment validated as `tesSUCCESS` with tag 0. Submission plus validation times were 6,296 / 8,687 / 7,469 / 7,520 / 6,276 ms. This validates independent keys and ledger behavior; it is **not** a Ledgerly Dev Send UI test. The existing signing-isolation gate remains in force.

Independent host SDK samples before these payments measured connections at 625 / 590 / 562 ms, five parallel balance requests at 207 / 216 / 240 ms, and five parallel history requests at 203 / 169 / 180 ms. These are host network baselines, not Android timings. They do not explain the original 34-second unlock delay.

Public numeric samples, funding evidence and transaction hashes are archived in `evidence/2026-10-14-android/`. CPU profiles and all recovery material remain outside Git in the restricted local test folder.

### Ranked findings and changes

| Priority              | Finding                                                                | Action / remaining requirement                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High                  | Five repeated JavaScript BIP39 derivations dominate unlock CPU/waiting | Native PBKDF2 worker, byte-compatible parameters and wipe/failure regressions; matched measurements above.                                                              |
| High                  | Large history mounts every record, creating ~7,000 native views        | FlatList outside the parent ScrollView, bounded rendering, stale-page/error regressions; loading and memory improve substantially.                                      |
| Medium                | Dynamic debug row rendering still misses frame deadlines               | CPU trace identifies dominant debug instrumentation. Smaller batch rejected; date formatter cached. Release/physical scrolling needs separate evidence.                 |
| Medium                | Accepted faucet funding can remain displayed as zero                   | Submit once and wait for validated balance growth; Mainnet, lock/switch, timeout and no-resubmit regressions. Explicit Testnet top-ups supported.                       |
| Medium                | Phone shell lacked independent-wallet management/complete totals       | Foreground create/import/rename/select flows, preview-address binding, duplicate rejection, backup acknowledgment, exact-drop aggregation and partial-failure handling. |
| Existing release gate | Native signing isolation is incomplete                                 | Dev Send stays disabled. SDK Testnet transfer evidence does not certify the phone's Send UI.                                                                            |
| Environment           | Android System UI hung during reboot                                   | Recovered without clearing app data; exclude boot interval and investigate repeated OS hangs separately from wallet code.                                               |

No upstream mirror, Argon2id parameter, vault encryption format, wallet address derivation, foreground locking rule, or transaction review gate was weakened. Import errors allow only known public messages; native/library errors cannot echo private input into an alert. The existing production candidate in `mobile/` has separate integration/release work; this audit's fixes and APK target the Ledgerly Dev sandbox in `apps/mobile`.

### Standalone release and functional results

The regular standalone release built successfully in 21m18s. It was installed with `adb install -r`, with no `DEBUGGABLE` package flag, while retaining the verified profile/vault. Metro was stopped before measurements. This x86_64 APK uses the local debug signing key for benchmark installation; it is not a store-ready production release. SHA256: `4586FD853CA17F65B59A0ADAFE257B7B3C5B681B297F95351902AAE9A6A3FF1D`.

| Release metric                              | Samples                         | Result / scope                                                                               |
| ------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| Cold Android first display                  | 1,006 / 871 / 1,206 ms          | Median 1,006 ms                                                                              |
| Warm activity recreation                    | 229 / 398 / 205 ms              | Median 229 ms, retained process                                                              |
| Hot activity resume                         | 109 / 231 / 159 ms              | Median 159 ms, retained process                                                              |
| Five-wallet unlock → all balances, observed | 8,541 / 8,335 / 7,970 ms        | Includes ADB/UIAutomator overhead; no additional unlock speedup claimed over optimized debug |
| App CPU during observed unlock              | 260 / 260 / 254 ticks           | Median 2.60 CPU seconds                                                                      |
| Loaded five-wallet PSS                      | 113,193 / 112,280 / 110,856 KiB | Median about 110 MiB, versus ~275 MiB optimized debug                                        |
| Synthetic 1,000-record fixture ready        | 3,174 / 3,400 / 4,247 ms        | Median 3,400 ms; separate local fixture APK                                                  |
| Synthetic fixture PSS after scrolling       | 118,089 / 110,608 / 119,679 KiB | Median about 115 MiB                                                                         |
| Scroll-only modern jank                     | 11.45 / 11.02 / 18.49%          | Still measurable on this emulator; not a physical-phone smoothness certification             |
| Scroll-only 95th percentile                 | 77 / 77 / 97 ms                 | Startup excluded; final cached-date/12-row-batch candidate                                   |

The separate synthetic release APK built incrementally in 2m54s, was used only for the labeled fixture, then replaced by the regular saved release APK. The normal source entry is restored and does not import the fixture. Fixture SHA256: `B7CB38ABAF0D4575FEF39C710DF162FEB0B4A99B3C5A71975A6D045F050ECB11`.

Home, Assets, Activity, Contacts and Settings passed three navigation rounds. Last-run PSS was 128,536 / 129,684 / 129,224 KiB: no monotonic growth in this short workload, not proof of leak freedom. Observed transitions generally took 2.4–3.4 seconds including hierarchy capture; those observations do not measure raw touch-to-frame latency. Backgrounding required unlock on return and added zero app CPU ticks in a ten-second sample after settling. Existing core lock closes the ledger socket, and the auth host stops token auto-refresh while inactive.

Network loss correctly made the complete total unavailable. Re-enabling Android Wi-Fi alone did not reconnect the virtual adapter; the probe was corrected to reconnect `AndroidWifi` and wait for connection before retrying. All five balances then returned to 499.999928 XRP. Earlier probe failures used the wrong retry label or attempted password entry again while the first unlock was still pending; they are not reported as application failures or successful timing samples.

At 200% font size, all 24 recovery indices were observed and two-digit indices remained single-line. The generated wallet was canceled before acknowledgment/commit; the stored vault remains five wallets. No phrase screenshots were saved. Earlier enlarged-font probe attempts ran during compilation/configuration changes and failed to reach the screen; the successful settled-device result is archived separately.

### Verification, limits and next recommendations

The development regression suite passed 43/43, including native byte compatibility/wiping, foreground lifecycle, independent-wallet backup/import, secret-safe errors, exact aggregation, partial failures, stale replies, pagination and invalid dates. Development and root TypeScript passed; scoped lint and diff checks passed. Android standalone release and iOS export passed. Before refreshing the branch, root/shared tests passed 208/208. The updated `main` adds production markets/security tests: the full run passed 254/255. Its unchanged JavaScript KDF scheduling derivation test (`tests/readiness/24-native-kdf-scheduling.test.ts:85`) timed out at 30 seconds and again in an isolated rerun with a 120-second CLI limit. The resolver test passed. The cause is not established; concurrency is not accepted as an explanation. This production-shell test remains a handoff limitation, and no crypto parameters or test assertions were weakened to obtain a pass.

This audit moved to `codex/android-five-wallet-performance` based on refreshed `origin/main` (`005191e`) after discovering PR #10 was already merged. A subsequent fetch found `c7ecde4`, which only updates daily security report files and does not overlap these Dev sources. Newer production files are retained. User-owned untracked `app.json`, `docs/requirements/`, and `output/` are excluded from this work.

Next priorities: measure the same scroll workload on a physical ARM64 phone; investigate the remaining emulator frame deadlines with platform tracing; add explicit splash/fully-drawn instrumentation; integrate these verified adapters and multi-wallet patterns into the separate production shell with its own QA; complete signing isolation before enabling Dev Send. Native secp256k1 derivation and debug React instrumentation remain measurable CPU contributors; no hand-written cryptography or speculative curve replacement was added. Further batch tuning stopped when it failed to produce repeatable gains.

Battery-life claims require a physical device; this plugged-in emulator supports CPU/background observations only. Exact UI-thread blocking/touch-to-present timing, full family-seed phone persistence, camera/scanner and native Send UI remain unverified here. The tests preserve five wallets, the verified encrypted backup, and private credentials for continued work; no previously retained recovery backup or phone data was deleted. Historical ignored test-login fixtures are not claimed to have been removed from cloud-synced folders.

## Measurement references

- [Android startup definitions and first/full display](https://developer.android.com/topic/performance/issues/launch-time)
- [Android dumpsys graphics and memory diagnostics](https://developer.android.com/tools/dumpsys)
- [Android slow rendering and frame deadlines](https://developer.android.com/topic/performance/vitals/render)

## Baseline evidence and first targeted change

The debug app rebuilt successfully with 239 tasks (11 executed/228 cached), then was installed with `adb install -r`; existing vault/profile data was retained. An initial build invocation failed before compilation because PowerShell split a dotted Gradle property; quoting the property corrected it. Startup measurements use three observations per launch type. Median wall time until the usable unlock screen was observed was 20,483 ms cold, 3,818 ms warm, and 3,366 ms hot; these include ADB/UIAutomator polling overhead and are not exact TTI or TTFD. No wallet data was cleared for cold launches.

CPU-only React Native tracing captured 35,494 samples over approximately 46 seconds, including one existing-wallet unlock. It enabled only the JavaScript-sampling category, excluded screenshots/network bodies/heap capture, and persisted only CPU profile chunks in the restricted local test folder. SHA-512 `process` accounted for approximately 2,437 ms self CPU beneath HMAC `digestInto`/the asynchronous loop. React debug instrumentation and module loading also consumed CPU. Summing async parent frames understates PBKDF2 work because stack ancestry changes across awaits; these samples are CPU observations, not per-method wall-time measurements. The legacy `Profiler` domain was unsupported; the installed React Native source's `Tracing` protocol was used instead, with the required localhost origin.

The first targeted change maps the existing BIP39 master-seed helper to the installed native crypto worker in standalone builds. PBKDF2-SHA512 retains 2,048 iterations, 64 output bytes, English-phrase validation, and NFKD normalization/salt semantics. Expo Go retains the original JavaScript implementation; missing standalone crypto fails clearly. Inputs/native output are wiped, and the copied master seed remains subject to the engine's existing cleanup. The upstream core mirror and Argon2id vault parameters are unchanged. Five focused regressions and development TypeScript passed, including actual byte compatibility, Unicode normalization, failure/wipe behavior, and native-only nonrecursive Metro resolution. The completed device remeasurements appear above.

After restarting Metro with the native BIP39 resolver, the existing encrypted wallet unlocked and reproduced the original public address and its 98.999988 Testnet XRP balance. A second CPU-only trace used the same approximately 45-second window with password entry and one unlock: SHA processing `process` self CPU fell from about 2,442 ms to 21 ms. This is a sampled CPU comparison, not a 99% end-to-end app speed claim. Modular-arithmetic work (~1,089 ms self CPU) and debug React instrumentation stood out next. The subsequent five-wallet, startup and release results appear above.

The existing architecture uses one profile login and one encrypted device vault/password for multiple wallets. Each independent wallet has its own recovery secret and public address; it does not need a separate profile login or a newly invented per-wallet password.
