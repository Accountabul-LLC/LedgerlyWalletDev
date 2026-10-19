# Ledgerly for iPhone and Android

This directory is the **production candidate** (`com.accountabul.ledgerly`, scheme `ledgerly`), owned by the **Accountabul** organization (`accountabuls`) in the existing `phone-app` project, displayed as **Ledgerly Production**. The separate **Ledgerly Dev** sandbox in `../apps/mobile` uses `com.accountabul.ledgerly.dev` and Expo project `@accountabuls/ledgerly-dev`, displayed as **Ledgerly Development** under the same organization. Always run EAS inside the correct app directory. The production profile uses the EAS `production` environment. The preview profile uses the EAS `preview` environment and sets `EXPO_PUBLIC_LEDGERLY_BACKEND=test` plus the public coordinates of the separate `ledgerly-test` Supabase project (`hwvyrlrmdktgfbqdmufz`) in eas.json, so preview APKs never sign in to, or report activity to, production. This role assignment does not authorize publishing or certify native signing isolation; release QA remains required.

Production builds read `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from that environment, with public coordinates for the live website's Supabase project `PRODUCTION_PROJECT_REF` as a compatibility fallback. Supply both coordinates together. The dev app has no fallback and requires its own development coordinates for the same current backend. Environment selection does not create a separate Supabase database. Changing the profile backend does not transfer old profile accounts or move on-device wallet secrets.

Native app for the same non-custodial XRP Ledger wallet that already runs on the web and as a browser extension. Keys are created and encrypted on the phone. A signed-in **profile** only stores wallet names and payees so you can watch balances on any device.

## Expo MCP

Yes — Expo has an official MCP server. It is **not** bundled in this repo; you connect it in Cursor (or Claude Code / VS Code) so the assistant can read Expo docs, install compatible packages, and drive EAS builds.

1. In Cursor: **MCP: Add Server** → HTTP
2. URL: `https://mcp.expo.dev/mcp`
3. Auth: OAuth with your Expo account (free plan includes monthly MCP usage)
4. One-click: [Add Expo MCP to Cursor](https://mcp.expo.dev/install?client=cursor)

Optional local extras (simulator screenshots, tap automation) need Expo SDK 54+ and:

```sh
npx expo install expo-mcp --dev
EXPO_UNSTABLE_MCP_SERVER=1 npx expo start
```

Docs: [https://docs.expo.dev/mcp/](https://docs.expo.dev/mcp/)

## Identity

| Field                        | Value                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Name                         | Ledgerly                                                           |
| Expo project slug            | `phone-app` (must match `extra.eas.projectId`)                     |
| Scheme                       | `ledgerly`                                                         |
| iOS bundle / Android package | `com.accountabul.ledgerly`                                         |
| Owner                        | Accountabul LLC (`accountabuls`)                                   |
| EAS project                  | `@accountabuls/phone-app` (`f99f929c-665b-4dfd-b158-e2321226f637`) |

The production Expo project slug remains `phone-app` so EAS and the existing Android keystore stay on this project. Display name, URL scheme, and store package IDs remain Ledgerly / `ledgerly` / `com.accountabul.ledgerly`. A dashboard rename to `ledgerly-wallet` is optional later and must retain the production project ID. The separate development project must not replace this production linkage.

## Run it (Expo Go)

From this `mobile/` directory:

```sh
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone. Deep links and camera scanning work best on a physical device. The Metro bundler also watches `../src/ledgerly` so the audited wallet engine stays in this repo.

## EAS Build

`eas.json` defines `development`, `preview`, and `production` profiles for iOS and Android. Run EAS commands from `mobile/` so the monorepo root (and `@ledgerly/core`) is still in the git checkout.

```sh
cd mobile
npx eas-cli build --platform ios --profile production
npx eas-cli build --platform android --profile production
```

GitHub production builds must use base directory `mobile` and the reviewed production branch (or `main` after merge). The Expo project has accepted GitHub builds from the existing phone-app branch. Confirm the connected repository is `Accountabul-LLC/Ledgerly-Wallet` in project GitHub settings before building. If reconnecting is necessary, an Accountabul owner/admin must:

1. Link GitHub at [expo.dev/settings#connections](https://expo.dev/settings#connections)
2. Install the [Expo GitHub App](https://github.com/apps/expo) on `Accountabul-LLC`
3. Connect `Accountabul-LLC/Ledgerly-Wallet` at [project GitHub settings](https://expo.dev/accounts/accountabuls/projects/phone-app/github) with base directory `mobile`

Until that is done, `eas build` from a machine logged in as `accountabul` still works (it uploads source; it does not need the GitHub app). TestFlight submit also needs an App Store Connect API key on the Expo account. Play submit needs a Google Play service account key.

## What this app reuses

- `@ledgerly/core` — vault, Argon2id, keyring, XRPL signing. The phone talks to it through the same `WALLET_METHODS` allowlist as the web worker.
- Watch-only profile balances — the same public ledger reads as the website, with no vault open.
- Encrypted vault on device — chunked into `expo-secure-store` (Keychain / Android Keystore). The unlocked session key stays in memory only.

## Security notes

- Recovery phrases are revealed only after a password, start hidden, and are wiped from the backup screen when you continue.
- Confirming a backup hashes answers with a per-challenge salt. The confirm screen never holds the words.
- Clipboard writes live in one helper and only run from a tap.
- This JS runtime does not have a web worker. Isolation is the RPC allowlist: UI files never import the engine.

- An RPC allowlist limits methods but does **not** isolate decrypted keys from the React Native heap. Native signing isolation remains a release gate.
- Backgrounding unmounts sensitive routes and locks the runtime. Operations finishing after a background transition are re-locked and their results rejected, even if the app has returned to the foreground.
- Protected routes enforce the persisted backup gate, and balance/history requests discard replies for earlier accounts, networks, and refreshes.

## Input and layout checks

Both phone shells use `../src/ledgerly/native/destinationTag.ts` for optional decimal uint32 tags. Zero is a real tag. Pasted signs, decimals, exponents, and values above 4294967295 are rejected without rewriting them. Invalid Receive input hides the QR/address and disables copying; it never falls back to a classic address that drops the requested tag. Selecting a payee fills its address and tag together, and selecting an untagged payee clears an earlier tag. QR payment links reject invalid or ambiguous tag parameters and malformed percent escapes.

Screens use the safe-area wrapper, and navigation retains the router's computed bottom inset. Recovery backup words use two growing columns. Recovery-phrase entry is a single secure line because Android does not mask multiline secure TextInput fields reliably; it can scroll horizontally and still accepts a pasted full phrase. Fields have accessible labels.

A failed send confirmation disables that consumed request. **Edit and build again** returns to the form without automatically preparing or submitting another transaction. Review the new fee and details before confirming again; an expired ledger window requires a fresh review.

The production candidate still uses JavaScript Argon2id. Local Expo Go restore completed within three minutes, compared with 17.64 seconds including UI polling in the development standalone native build. The development native KDF is not yet integrated into this shell. Native signing isolation, camera/physical-device QA, and standalone production validation remain release gates. See `../docs/qa/2026-10-13-local-android-emulator.md` for measured checks and their limits.
