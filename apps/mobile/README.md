# Ledgerly development app

## Native markets and icon library

Home previews five XRPL.to quotes; Explore markets opens a virtualized 20-asset list. These are
Mainnet USD quotes, separate from the selected wallet's network and holdings. Tickers are bound to
currency plus validated issuer, never matched by display name. Every quote screen shows clickable
`Data by xrpl.to` attribution, its last-check time, and an explicit saved/error state.

Without `EXPO_PUBLIC_MARKET_API_ORIGIN`, the native client makes two documented anonymous requests
at most once per ten minutes, including failed/manual refreshes. Public quotes use SQLite disk
cache and bounded JSON parsing; background/unmount aborts requests. Market modules cannot access
the wallet, profile, recovery material or signing. No provider API key belongs in Expo variables.

Issued-token logo delivery remains off until XRPL.to redistribution permission and a backend key
are configured. The existing first-party proxy requires both `XRPL_TO_REDISTRIBUTION_APPROVED=true`
and server-only `XRPL_TO_API_KEY`; its raster guards reject SVG/HTML, redirects and oversized images.
Native images use fixed sizes, memory/disk caching and neutral offline fallbacks. Official XRP
artwork and provenance are in `assets/branding`; other icons use local vectors, consistent strokes,
and the existing Ledgerly palette. Neither artwork nor provider metadata establishes issuer trust.

`npm` start/export/run scripts and EAS post-install run `scripts/native-public-config-preflight.cjs`
before bundling. Direct CLI/Gradle invocations must run the same check explicitly from this app's
directory with Node 24. The check rejects server-role credentials without printing their values.
Auth cache validation, profile changes and initial create/import races have synthetic regressions
in `test/security-auth.test.cjs`; full findings are in the dated native red/blue security report.

This directory is the **development sandbox**, installed as **Ledgerly Dev** (`com.accountabul.ledgerly.dev`, URL scheme `ledgerly-dev`). The production candidate lives in `../../mobile`. Both use the existing Expo project and shared wallet engine, but their installed app storage is separate. The former prototype identifier `com.accountabul.ledgerlywallet` is retained only in historical builds; changing to the dev identifier creates a fresh sandbox and does not migrate or delete the old installation's vault.

Native Expo/React Native host for Ledgerly Wallet. This is not a WebView wrapper.

The app imports the existing wallet engine from `../../src/ledgerly/core`, uses the user-supplied Ledgerly emblem, and maps the existing web design tokens into React Native styles.

### Brand assets

`assets/ledgerly-emblem.svg` is the supplied vector source, and `assets/ledgerly-icon.png` is the supplied PNG used on app screens. `ledgerly-app-icon.png` is a 1024×1024 opaque rendering of the SVG with the background rectangle's rounded corners removed so the operating system applies its own mask. Android uses transparent foreground and monochrome variants with the SVG background removed and the emblem scaled by 0.75 around the center, over background `#171a18`. Regenerate those variants from the vector source when the emblem changes; do not restore the former extension icon. The EAS development project icon uses the opaque app icon. Launcher icon changes require a new native build; app-screen images reload through Metro.

## Independent wallets and balances

After unlocking and confirming the initial backup, open Settings → Manage wallets to create an independent 24-word wallet or import a supported recovery phrase/XRPL family seed. Each independent wallet has its own recovery secret, encrypted in the existing device vault; all wallets share the profile login and device-vault password. The import preview binds the saved record to the displayed public address and rejects duplicates. Fresh creation requires an offline-backup acknowledgment. Leaving the screen clears pending secrets; leaving the foreground locks the vault. The native adapter exposes these explicit operations but still excludes transaction signing and general recovery export.

Home distinguishes the selected wallet balance from the combined XRP balance. One request per wallet supplies both views, and wallet switching reuses those results. Network changes discard stale results. Addition/refresh fetches the current wallet set; a failed balance prevents displaying a complete total. Aggregation uses integer drops. Refresh is explicit; no polling keeps the wallet unlocked.

Testnet faucet acceptance may precede ledger validation. The native funding adapter submits once, checks for a validated balance increase for up to 20 iterations with one-second waits, and stops if the vault locks or the network changes. A timeout reports pending funding rather than issuing another request. Faucet funding remains unavailable on Mainnet.

Activity uses its own virtualized list, outside the parent ScrollView. It renders an initial 12 rows and bounded batches/windows, preserves pagination and account/network isolation, and reuses a locale/time-zone formatter for the mounted screen. Invalid timestamps omit the date rather than crashing history. The opt-in `test/fixtures/HistoryBenchmark.tsx` contains 1,000 synthetic records without profile, vault, signing or network access; it is not imported by the normal entry and must never replace a published application entry.

Standalone builds also map BIP39 PBKDF2-SHA512 to the installed native worker, preserving 2,048 iterations, 64 bytes, phrase validation and NFKD semantics. Expo Go retains the original implementation. See `../../docs/qa/2026-10-14-android-performance-audit.md` for controlled measurements and remaining release gates.

## Requirements

- Node.js 24 (the repository runtime)
- npm 11 or newer
- Android Studio/SDK for local Android device builds
- macOS and the Expo-supported Xcode version for local iOS device builds

## Install and verify

```sh
cd apps/mobile
npm ci
npm run typecheck
npm test
npx expo-doctor
npm run export:android
npm run export:ios
```

Run locally with `npm run android` or `npm run ios`. The iOS command requires macOS for a local simulator.

### Native password derivation

Standalone development builds use `react-native-quick-crypto`'s asynchronous Argon2id worker. Metro substitutes `src/nativeKdf.ts` for the shared core KDF host without rewriting the upstream mirror. The native host imports the original validation/defaults and preserves password normalization, memory, iterations, parallelism, version, salt, output size, and the encrypted vault format. Native errors propagate; a standalone build with missing native crypto fails clearly instead of silently entering the slow JavaScript path.

Expo Go explicitly uses the original JavaScript implementation because it cannot load this additional native module. Use `npm run android` to build/install the actual Ledgerly Dev application when profiling unlock performance. Native dependencies require rebuilding the app; reloading Metro alone cannot add them. The unit vectors compare the host's parameter mapping with the existing implementation; device timing and cross-runtime vault compatibility must also be verified before calling the speed improvement complete.

For an x86_64-only local debug build after `npx expo prebuild --platform android --no-install`, run from `android/`:

```powershell
./gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 --max-workers=2 --console=plain --init-script ../scripts/windows-native-cache.gradle
```

On the current Windows/Java 17 setup, Java's Unix-domain selector socket returned `Invalid argument: connect`. A process-scoped workaround verified by a selector smoke test is to point `jdk.net.unixdomain.tmpdir` at a nonexistent directory, so OpenJDK uses its existing TCP fallback. Before launching Gradle in that terminal:

```powershell
$socketFallbackPath = Join-Path $env:LOCALAPPDATA 'LedgerlyAndroid/JavaSockets/tcp-fallback'
if (Test-Path -LiteralPath $socketFallbackPath) { throw 'The Java TCP fallback path must remain nonexistent.' }
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$socketFallbackPath"
```

This does not change global Java or networking settings. The Windows init script places generated CMake staging files under `%LOCALAPPDATA%/LedgerlyAndroidBuild/cxx`; this avoids the Ninja manifest regeneration failure observed with long OneDrive build paths. Source remains in this repository. Generated `android/` files and local debug signing artifacts are ignored; app configuration and dependencies remain the source of truth. After building, run `./gradlew.bat --stop` to release idle Gradle daemons when no other build is running.

### Windows Android emulator

The development host's `nativeNetworks.ts` selects `wss://s2.ripple.com` for Mainnet, retaining the upstream chain ID, explorer URLs, test-network definitions, and secure-endpoint validation. The prior endpoint returned HTTP 418 to Android's native WebSocket handshake; a direct native probe verified that the replacement accepts connections. This full-history endpoint is listed in [XRPL's public-server documentation](https://xrpl.org/docs/tutorials/public-servers). It is a public testing dependency, not dedicated production infrastructure. Metro substitutes this host module only for Android/iOS in `apps/mobile`; the mirrored core, web application, and production shell remain unchanged.

The local development machine has the Android SDK at `%LOCALAPPDATA%\Android\Sdk`, Microsoft OpenJDK 17 under `%LOCALAPPDATA%\LedgerlyAndroid\Java`, and the `Ledgerly_Dev_API_36` Android 16 virtual device. User environment variables point to the SDK and Java; open a new terminal after installation. The SDK includes platform-tools, emulator, Android API 36, build-tools 36.0.0, and the Google APIs x86_64 system image. Android Studio is optional for this command-line setup.

Start the virtual device in one terminal:

```powershell
& "$env:ANDROID_HOME\emulator\emulator.exe" -avd Ledgerly_Dev_API_36 -gpu host -feature -Vulkan -memory 3072 -cores 2 -no-snapshot
```

After Android has finished booting, start Metro from this directory in another terminal:

```powershell
$env:NODE_OPTIONS = '--dns-result-order=ipv4first --max-old-space-size=1024'
npm start -- --localhost --go --port 8083 --max-workers 1
```

The IPv4 DNS preference is necessary on this Windows machine: Node otherwise binds `localhost` to IPv6 `::1`, while ADB reverse forwards to IPv4. Keep Metro restricted to localhost. Once it is listening, connect the already-installed SDK 57 Expo Go client:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 reverse tcp:8083 tcp:8083
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8083 -p host.exp.exponent
```

This opens the Expo Go fallback. For the installed standalone Ledgerly Dev debug build, use:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 reverse tcp:8081 tcp:8083
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell am start -n com.accountabul.ledgerly.dev/.MainActivity
```

If the debug app cannot load its script, open its development menu with `adb shell input keyevent 82`, choose **Change Bundle Location**, and apply `127.0.0.1:8083`. React Native 0.86 keeps that menu override in memory, so it may need reapplying after a process restart. The stock emulator defaults to `10.0.2.2:8081`, which does not reach this localhost-only server. The current disposable emulator app has a persistent debug-only `debug_http_host` preference set to `127.0.0.1:8083`.

The optimized virtual device uses `hw.cpu.ncore=2`, `hw.ramSize=3072`, `hw.gpu.enabled=yes`, `hw.gpu.mode=host`, `hw.lcd.width=540`, `hw.lcd.height=1200`, `hw.lcd.density=210`, and `hw.lcd.vsync=30` in its AVD `config.ini`. This preserves the prior 411×914 dp viewport while rendering 44% fewer pixels. Host Vulkan produced black preview frames on this Intel driver; the launch command disables Vulkan while retaining host OpenGL. A 2.5 GB guest caused Android system stalls on this machine; retain 3 GB. Host process memory exceeds the guest allocation. Metro excludes generated Android/iOS build folders and uses one worker. Run only one Metro instance. Verify acceleration with `emulator -accel-check` and boot completion with `adb -s emulator-5554 shell getprop sys.boot_completed` before installing apps. Cold boot can take several minutes and temporarily use both guest CPUs; allow Android background startup to settle before measuring idle use.

Use disposable test profiles and device wallets. This development shell uses the ledgerly-test
Supabase project (`hwvyrlrmdktgfbqdmufz`), separate from the live website. Keep test credentials
outside Git; never record recovery words, wallet passwords, or session tokens in screenshots or UI
dumps. Device automation and emulator checks complement physical-device release QA.

Copy `.env.example` to `.env.local` and provide the ledgerly-test project URL
(`https://hwvyrlrmdktgfbqdmufz.supabase.co`) and its publishable client key before starting or
exporting the app. Accounts on this project are separate from production website accounts.
Authentication sessions are persisted with Expo SecureStore; wallet passwords, recovery phrases,
and signing keys remain in the separate encrypted wallet vault.

### Physical iPhone during the SDK 57 transition

Ledgerly requires Expo SDK 57 because its vault adapter uses Expo's native AES-GCM API. During Expo's SDK 57 App Store transition, the App Store version of Expo Go may still report this project as requiring a newer client. Install the matching SDK 57 Expo Go build through Expo's official device-provisioning page at [sign.expo.dev](https://sign.expo.dev/), then reopen the Metro URL. Do not downgrade Ledgerly to SDK 54: that SDK does not provide the native AES-GCM API used by the encrypted vault.

## EAS builds

Authenticate with Expo through the browser or provide an Expo access token through the process environment. Never write the token into this repository. Then run:

```sh
npx eas-cli@latest whoami
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
npx eas-cli@latest build --platform ios --profile simulator
```

The preview profile produces shareable internal-distribution builds for physical Android and registered iOS devices. The iOS simulator profile produces an unsigned Simulator archive. A physical-iPhone build requires Apple Developer credentials and ad hoc device provisioning; TestFlight additionally requires distribution signing and completed App Store Connect export-compliance metadata.

Before a cloud build, inspect the exact upload archive when its contents change:

```sh
npx eas-cli@latest build:inspect --platform android --stage archive --profile preview --output ../../.codex-temp/eas-archive --force
```

## Configuration

The app is linked to **Ledgerly Development**, `@accountabuls/ledgerly-dev` (project ID `8fbd1a0a-d66b-48db-9ea5-7706a30f24dc`). The **Accountabul** organization (`accountabuls`) owns both this development project and **Ledgerly Production** (`phone-app`). The personal login `accountabul` administers the organization. All build profiles in this directory use this development project's EAS `development` environment. Production commands belong in `../../mobile`. Build history and credentials are scoped to each Expo project; production credentials remain on the production project.

Pull local configuration with `npx eas-cli env:pull --environment development` from this directory, then run `npm start`. Development uses the ledgerly-test Supabase project `hwvyrlrmdktgfbqdmufz`, separate from production `PRODUCTION_PROJECT_REF`. Use the test project's URL and matching publishable key, not the production project or the retired authentication project `vsaouxymljdcbbsissom`. Profiles do not move between those projects automatically. Wallet vaults remain on-device and are not migrated by changing profile backends.

Only public client configuration may use `EXPO_PUBLIC_*` variables. Expo access tokens, Supabase service-role keys, recovery phrases, family seeds, private keys, and wallet passwords must never be committed or embedded in a build.

Required build variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Current security gate

The native surface exposes Ledgerly account sign-in, wallet lifecycle, live balances and assets, receive sharing, activity, contacts, account and network selection, display preferences, auto-lock controls, and test-network funding. Cloud contact/label synchronization, transaction preparation, signing, trust-line changes, recovery export, and account-secret import/export remain outside the native adapter. Do not expose those methods until the isolation requirement in `../../docs/architecture/native-mobile-port.md` is satisfied and reviewed.

The only backup resumption exception is `resumePendingBackup`: it requires an unlocked, unconfirmed wallet, re-verifies the wallet password, and rechecks the lock/backup state before returning the phrase. Completed backups cannot use this route. The UI keeps Home unavailable until backup confirmation, clears the phrase on lock/background, and rejects in-flight create/unlock/reveal results after backgrounding. General recovery export and signing remain disabled.

`npm test` runs component logic with mocked native surfaces plus adapter, lifecycle, stale-response, and app-identity regressions. These tests do not replace physical iOS/Android QA. Before release, test create → background → unlock → resume backup → confirm, restart before backup, wrong password, auto-lock, account/network switching with slow requests, and side-by-side prod/dev installation.

Form ScrollViews keep `removeClippedSubviews={false}` for the small recovery form. Device QA verified checking enables continuation, unchecking disables it, and confirming opens Home. Automation uses a 100 ms touch because zero-duration ADB taps were sometimes missed at the reduced frame rate; the original missed acknowledgment cannot be attributed solely to clipping. Recovery numbers grow naturally at enlarged text sizes, and the decorative checkmark keeps its icon size. Navigation labels allow up to 160% scaling to keep complete words in the five tabs, while screen content honors the system text setting.

Receive and contact inputs validate optional decimal destination tags from 0 through 4294967295 without stripping pasted characters. Invalid receive tags hide the address and disable sharing rather than dropping the tag. A valid zero tag remains encoded into the X-address. The status bar is owned by the root and input/switch accessibility labels identify their purpose.
