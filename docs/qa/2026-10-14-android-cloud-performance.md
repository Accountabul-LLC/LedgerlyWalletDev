# Android cloud and five-wallet audit — October 14, 2026

Status: cloud emulator/viewer restored; five-wallet engine integration and Android profile tests passed; a native KDF responsiveness fix was verified in the executable Android bundle and its loading UI. The full native wallet and release performance audit is incomplete. No production performance claim is made from Node or software-emulator measurements.

## Scope and source

Baseline source: `codex/mobile-audit-fixes` at `7cafa006d5333b3b7e38b1fb1eddb5d23fe81a0b`. Final tooling checkout also includes the later audit checkpoint `6e851989b93a9c1b56d48d6a7a1e56785e2aba80`. `apps/mobile` is Ledgerly Dev, with native Argon2id; `mobile` is the production candidate, with the multi-wallet dashboard and JavaScript KDF. They are separate installed identities. The original cloud environment was not attached to this chat; this fresh workspace required restoring the SDK, mobile checkout, Metro, and viewer.

Viewer: https://ledgerly-cloud-emulator.accountabul.chatgpt.site — existing private Sites publication, read-only. Frames are sent through the existing session proxy. Viewing requires the owner's ChatGPT sign-in. The local uploader defaults to a neutral frame and requires an explicit public-screen marker. A pause marker is set before navigation, credentials, or private wallet steps. Tokens are passed through hidden stdin and stay in process memory. UI hierarchies are inspected only in memory and are not persisted. Unauthenticated frame requests returned HTTP 401.

## Passed integration checks

A disposable inbox was created and its Ledgerly signup email confirmed. Actual email/password sign-in succeeded. The authenticated profile stored and retrieved five public address/label records. No wallet key material was uploaded to Supabase.

The real wallet engine created four independent wallets, including the initial wallet, and imported a fifth XRPL family seed. All five addresses were distinct. The encrypted vault was written to a private disk-backed store; a new engine with a fresh memory-session store started locked, unlocked with the same password, and restored all five addresses. The raw persisted record did not contain the password or imported seed.

Actual Android sign-in succeeded in Expo Go and opened the watch-only profile. All five public labels were observed through scrolling. The profile session survived a process restart. These profile records hold public addresses and names; they do not restore the five private wallet records on Android.

Each wallet received 100 Testnet XRP. The aggregate starting balance was 500 Testnet XRP. Faucet acceptance was followed by validated-ledger balance checks; the initial pre-validation zero balances were not treated as an application defect. A 1 XRP payment from Wallet 1 to Wallet 2 validated with `tesSUCCESS`; the source lost 1 XRP plus its fee and the destination gained exactly 1 XRP. A later independent validated-ledger read found 98.999988 XRP in Wallet 1, 101 XRP in Wallet 2, and 100 XRP in each other wallet. The total was 499.999988 XRP: exactly the original 500 XRP minus the 12-drop fee. Rapidly selecting wallets 20 times preserved the expected account identity. Five history requests completed.

The disposable engine vault was removed after the integration run. This was a Node integration test of the same engine; it does not establish Android SecureStore persistence, emulator reboot recovery, touchscreen flows, frame smoothness, or native signing isolation.

## Baseline and after status

| Metric                     | Before     | After               |
| -------------------------- | ---------- | ------------------- |
| engineStartMs              | 2.69 ms    | Unchanged; baseline |
| createWalletMs             | 694.19 ms  | Unchanged; baseline |
| createWallet2Ms            | 33.5 ms    | Unchanged; baseline |
| createWallet3Ms            | 38.59 ms   | Unchanged; baseline |
| createWallet4Ms            | 22.17 ms   | Unchanged; baseline |
| importWallet5Ms            | 8.8 ms     | Unchanged; baseline |
| restartUnlockMs            | 632.07 ms  | Unchanged; baseline |
| fundWallet1Ms              | 1380.03 ms | Unchanged; baseline |
| fundWallet2Ms              | 319.74 ms  | Unchanged; baseline |
| fundWallet3Ms              | 268.81 ms  | Unchanged; baseline |
| fundWallet4Ms              | 275.89 ms  | Unchanged; baseline |
| fundWallet5Ms              | 330.78 ms  | Unchanged; baseline |
| fiveBalancesColdMs         | 1688.68 ms | Unchanged; baseline |
| fiveBalancesCachedMs       | 0.06 ms    | Unchanged; baseline |
| fiveHistoryLoadsMs         | 263.35 ms  | Unchanged; baseline |
| rapidSwitch20Ms            | 47.14 ms   | Unchanged; baseline |
| preparePaymentMs           | 999.53 ms  | Unchanged; baseline |
| submitAndValidatePaymentMs | 7645.69 ms | Unchanged; baseline |

A deferred-engine/public-route candidate passed tests and exports but failed Android cold deep-link verification and was reverted. A later native KDF scheduling change was accepted for responsiveness after host byte-equivalence tests and Android loading-render verification; its measurements are below. No faster Android unlock claim is made. Cached reads are an existing engine behavior, not a new before/after improvement. Public-network latency is not an isolated CPU measurement. Ledger validation time varies with ledger close and server timing.

Transaction hash: `396210A9C18D346E13B9702B1ACD3073590C2E78C6A541C045A489D669F38222`; validated ledger: `21523951`.

- Wallet 1: `rx47bW9DqCZjXoWaSoEH1eqADceP3M5i3`
- Wallet 2: `rK1MU9zA7XLXD6Zb6AFziiKiyajrAQpdRT`
- Wallet 3: `rMbA1wmViPnbVmPfdDm8nS7efHj9DM8ymV`
- Wallet 4: `rUtbzDL9gWkzArZQi7XbDicaxR3imCSuSP`
- Wallet 5: `r3d6wJMLT14MRCmzFetgTwBFhCHBzHXXZr`

## Android observations and environment changes

Android 10/API 29 x86_64 booted and ran the SDK 57 production candidate in Expo Go. This differs from the prior Android 16 emulator; the older image was chosen for a workable software-emulation loop. The display is 540×960 at 210 dpi and an observed 30 Hz, preserving the initial Pixel 2 logical viewport while reducing pixels by 75%. Guest RAM is 2 GB; the host QEMU process used roughly 3.5 GB. Metro used one worker and roughly 250 MB in an observed sample.

| Check or metric                        | Before                           | After / final result                                                             |
| -------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Android SDK/emulator in this workspace | Absent                           | Booted ADB device, Android 10 x86_64                                             |
| Metro download from Android            | Failed remote update             | Bundle downloaded; Ledgerly screens rendered                                     |
| Viewer                                 | Previous workspace not available | Updating owner-private HTTPS viewer; unauthenticated HTTP 401                    |
| Android profile sign-in                | Not tested                       | Passed; 18,186 ms to profile header including polling                            |
| Process-cold launch to profile header  | 113,030 ms, including polling    | No accepted app change; baseline remains                                         |
| Android native cold activity start     | 8,050 ms                         | Baseline, Expo Go host only                                                      |
| Repeat foreground navigation           | 10,610 ms including polling      | Baseline; Android classified the reused launch as UNKNOWN (0)                    |
| Background/resume navigation           | 13,287 ms including polling      | Baseline; existing process/route reuse                                           |
| Graphics snapshot                      | Not measured                     | 86.35% janky frames; p50 77 ms, p90 200 ms during this software-emulated session |
| Memory snapshot                        | Not measured                     | 385,243 KiB total PSS for Expo Go plus the project                               |

The header timing is not an isolated time-to-interactive measurement or a release-app launch metric. UiAutomation polling contributes overhead. Graphics counters include the Expo host, startup and navigation; this is not a scientific scrolling comparison. A single memory snapshot does not establish absence of leaks. Battery measurements on this emulated host would not represent a phone.

Accepted environment work: restored SDK and mobile checkout; IPv4 localhost Metro with one worker; a sidecar-preserving proxy bridge with a local Metro route; disposable CA bind-mount trust with correct SELinux labels and TLS verification retained; APK push installation after streamed installation stalled; and viewer pausing for credentials/private steps. Repeated UiAutomation in the frame uploader was removed because it competed with accessibility testing. System UI ANRs were observed during initial installation.

## Ranked findings

1. **Blocking functional gap:** the production Android candidate displays and selects multiple accounts but has no post-setup account creation/import UI. `settings.tsx` lists wallets and `send.tsx` selects existing wallets; neither calls `addAccount`, `addAccountWithOwnPhrase`, or `importAccount`. The five-wallet scenario therefore cannot be executed end-to-end through this app UI. The core methods passing does not fill this gap.
2. **Blocking benchmark limitation:** this cloud host exposes no `/dev/kvm`; `emulator -accel-check` reports that KVM requires a CPU supporting vmx/svm. Software emulation can support functional checks but cannot give representative phone CPU, battery, or latency results. Hardware acceleration should be provided by the cloud runtime for trustworthy performance comparisons.
3. **High, observed UI starvation:** the production candidate's Argon2id runs in JavaScript. Noble 2.2.0 explicitly yields only to microtasks, which can monopolize the JavaScript runtime and delay React updates and input handlers during derivation. The original Android import did not reach Home during a greater-than-seven-minute observation; the original enabled Continue form remained visible. A captured sample found the JS thread at 58.8% of one emulated core and Expo Go PSS at 378,904 KiB. These observations do not isolate all CPU time to Argon2. Ledgerly Dev already has a native KDF host; a production native KDF still needs a standalone-device comparison with unchanged vault parameters.
4. **Functional scope distinction:** watch-only profile balances always use Mainnet. The device dashboard uses the selected ledger. Testnet wallet labels in the profile consequently show Mainnet inactivity, not the funded Testnet amounts.
5. **Security prerequisite:** `docs/architecture/native-mobile-port.md` requires an approved isolated engine/native boundary before exposing signing or new secret import/export methods in the native adapter. This audit does not broaden that surface or modify the mirrored core.

## Validation

- 210 repository tests passed including two new scheduling regressions on the final resolver revision.
- 23 development-host tests passed, including KDF mapping, stale responses, backup gating, and destination tags.
- Root, development host, and production candidate TypeScript checks passed after installing all three lockfiles.
- Web build, development Android export, and production-candidate Android/iOS exports passed.
- The committed cloud benchmark driver was executed independently and passed, including exact fee aggregation and vault cleanup.
- No release APK or representative physical-device performance evidence. Helpers are in `scripts/android-cloud/`; the reproducible engine runner is `scripts/run-android-cloud-wallet-benchmark.mjs`.

## Native KDF scheduling follow-up

Noble `nextTick` is an empty async function. Its documentation says that it yields to microtasks, not the full event loop. The phone host now supplies a timer-based yield in `mobile/src/kdf-scheduler.ts`, using Metro to resolve the native noble directory's relative `./utils.js` imports consistently. Directory consistency matters because Metro caches these resolutions by directory: a rule applied only to Argon2 can be bypassed when SHA resolves the same helper first. The shim re-exports the library helpers and overrides only `nextTick`; mirrored engine source, algorithms, Argon2 memory/pass/parallelism/version parameters, normalization and vault format are unchanged. The shim's import resolves to the original utilities, preventing recursion. Web resolution is unchanged.

| Host scheduling measure, Node 24                 | Before                 | After     |
| ------------------------------------------------ | ---------------------- | --------- |
| Timer callbacks during default Argon2 derivation | 0                      | 89        |
| First timer callback during derivation           | None before completion | 15.87 ms  |
| Total derivation time in this sample             | 586.28 ms              | 727.88 ms |
| Derived bytes                                    | Reference              | Identical |

This improves scheduling responsiveness, with a throughput cost in this host sample. It does not establish faster Android unlock or release performance. Regression tests compare exact derived bytes for default `m=47104,t=1,p=1` and `m=19456,t=2` with both `p=1` and `p=2`, verify timers execute during derivation, and verify native resolver routing and recursion prevention. An executable Android debug bundle was inspected to verify that the scheduling module is included; a passing source test alone was insufficient. In the corrected Android build, the submitted import form rendered its pending state (the Continue label disappeared while all three populated secret fields and the import title remained). In the original trial, that enabled Continue form remained visible during a greater-than-seven-minute window. No form screenshots or field values were persisted. A separate resource sample during the pending operation found Expo Go PSS of 376,073 KiB. A spinner-period graphics sample had 556 frames, 93.53% flagged janky, p50 65 ms and p90 105 ms. This differs from the earlier mixed-session sample and is not a comparative scrolling result. Software emulation remains unsuitable for judging phone frame performance.

The corrected Android import still did not reach Home within the bounded 600-second polling window. The process was stopped and its disposable data cleared. Neither Android wallet persistence nor unlock/creation throughput passed in this trial. The scheduling fix therefore addresses the observed pending-state rendering, not this severe throughput problem.

Additional raw evidence is in `/workspace/shared/android-performance/`: `kdf-scheduling.json`, `native-import-before.json`, `native-import-threads.txt`, `native-import-memory.txt`, and a ten-second Android scheduler/graphics trace. The baseline import was aborted with a force-stop of the disposable Expo Go process. It is a failed functional trial, not a successful import latency measurement. The optional Hermes CDP profiler/evaluation methods were unavailable in this Expo Go target; no CPU-stack profile is claimed.

## Remaining Android checks

A release cold/warm/hot comparison, isolated splash and interactive timings; actual five-wallet touchscreen creation/import; lock/unlock, process-kill and emulator-reboot persistence in Android SecureStore; all-screen navigation and scroll frame times; large histories; network loss/restore; CPU/memory/leak profiling; battery assessment; release-versus-debug comparison; faster native cryptographic execution and repeat device benchmarks. The KDF scheduling change above addresses responsiveness only. These remain open; engine checks and the Android watch-only profile do not establish them.

## Cleanup

The engine benchmark vaults were removed and both private test folders were empty at completion. The follow-up Android import used a separate disposable family-seed wallet, funded with 100 Testnet XRP. After the bounded failure, Expo Go data was cleared again and that seed/password file was deleted; both private test folders again contained zero files. A scan of the saved report, benchmark evidence and decompressed scheduler trace found neither follow-up credential. Five public label records were removed from the disposable Supabase profile, its refresh sessions were revoked, its temporary inbox was deleted, and its private credential file was deleted. Expo Go's data in this fresh cloud AVD was cleared, removing the persisted test session. Testnet accounts remain on the ledger; their disposable signing material is no longer retained.

The disposable Supabase auth user record remains: the public client cannot perform admin user deletion, and this session's admin connector access to the project was denied. No real user records or device wallets were changed.
