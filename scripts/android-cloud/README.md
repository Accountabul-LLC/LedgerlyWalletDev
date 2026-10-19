# Disposable cloud Android helpers

These helpers support the Linux `/workspace` Android test environment. They do not
build a release APK or replace physical-device performance checks. Keep private
credentials outside Git and keep the inherited session proxy and CA trust.

The working setup uses Android 10/API 29, x86_64, a 540×960 display at 210 dpi and
30 Hz, two virtual CPUs, and 2 GB guest RAM. This host has no `/dev/kvm`; software
emulation is functional but slow. Use an accelerated host for release benchmarks.

The SDK is at `/workspace/android-sdk`. Create the disposable AVD after installing
`platform-tools`, `emulator`, and `system-images;android-29;default;x86_64`, then run:

```sh
/workspace/android-sdk/emulator/emulator -avd Ledgerly_Cloud_API_29 \
  -accel off -no-window -gpu swiftshader -feature -Vulkan \
  -memory 2048 -cores 2 -no-snapshot -no-audio
```

Start `proxy-bridge.py` in another terminal. It forwards external traffic through
the runtime sidecar and routes only the existing loopback Metro service locally.
Start Metro from `mobile/`:

```sh
NODE_OPTIONS='--dns-result-order=ipv4first --max-old-space-size=1024' \
  CI=1 npm start -- --localhost --go --port 8083 --max-workers 1
```

Place the official SDK 57 Expo Go APK at `/workspace/android-setup/Expo-Go.apk` and
run `finish-emulator.py`. It waits for boot, copies the original platform CA trust
anchors into a disposable bind mount, adds the runtime public CA certificates,
retains SELinux enforcement, sets the emulator HTTP proxy, uses ADB reverse, and
installs the APK without streaming. It does not reset app data or disable TLS.

`viewer-push.py` uploads frames to the existing owner-private Sites viewer. Pass a
single JSON object containing `url` and the existing viewer `token` through its
hidden stdin prompt. The token remains in process memory. Do not put it in command
arguments, source, environment files, or reports.

The viewer defaults to a neutral frame. After inspecting a public screen, create
`/workspace/android-setup/viewer-public` and remove the `viewer-paused` marker.
Create `/workspace/android-setup/viewer-paused` **before every navigation or form
interaction** and keep it present through passwords, wallet creation, unlock,
recovery, and import. Resume only after verifying a public screen. The viewer is
read-only; no visitor can navigate the emulator. Avoid concurrent UiAutomation
commands, which interfere with Android's accessibility service.

The same-engine Testnet benchmark is separate from Android UI execution. Install
the root and `mobile/` lockfiles, then run from the repository root:

```sh
LEDGERLY_TEST_PRIVATE_DIR=/workspace/android-private-benchmark \
LEDGERLY_TEST_REPORT=/workspace/shared/android-performance/engine.json \
  node scripts/run-android-cloud-wallet-benchmark.mjs
```

The runner uses the inherited HTTPS proxy for the test SDK adapter. It creates
four independent wallets and imports a fifth, writes only the encrypted vault,
tests a fresh-engine unlock, funds all five on Testnet, verifies aggregation and a
1 XRP payment including the exact fee, and removes its private vault afterward.
Reports contain public addresses, transaction results, and timings. It does not
provision a profile, exercise Android SecureStore, or claim touchscreen tests passed.
