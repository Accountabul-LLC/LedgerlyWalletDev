# Ledgerly native mobile port

## Goal

Ship Ledgerly as real React Native applications for iOS and Android while preserving the existing Ledgerly wallet engine, security behavior, brand assets, visual tokens, and product language.

The native app must not embed `ledgerlywallet.com` in a WebView and must not introduce replacement branding.

The reduced API surface and foundation scope below describe `apps/mobile`, now the development host. The broader production candidate is in `mobile`; its signing surface still requires a separate isolation review before release. The role map below is the current build/source contract.

## Sources of truth

- Product repository: `Accountabul-LLC/Ledgerly-Wallet` (public dev mirror: `Accountabul-LLC/LedgerlyWalletDev`).
- Shared wallet core: `UPSTREAM_OWNER/xrpl-browser-wallet` (set `CORE_UPSTREAM_REPO`), currently mirrored into `src/ledgerly/core` at the commit recorded in `src/ledgerly/core/UPSTREAM.json`.
- Web visual system: `src/ledgerly/ui/styles.css`.
- Development app emblem: `apps/mobile/assets/ledgerly-emblem.svg` and the user-supplied `ledgerly-icon.png`; native launcher variants are documented in `apps/mobile/README.md`.
- Reviewed deployable source: GitHub `main`. Lovable may advance it; Codex integrates changes on reviewed `codex/*` branches. Native shells stay in their designated directories and share the wallet core.

## First pull request scope

The first change establishes an independently buildable Expo/React Native host and proves the native wallet lifecycle:

1. Load the existing `WalletEngine` without copying or modifying its mirrored source.
2. Supply native AES-GCM and secure-random operations through `expo-crypto`.
3. Persist only the engine's encrypted vault record and non-secret preferences through SQLite-backed key-value storage.
4. Keep the unlocked session in memory and lock immediately when the app leaves the foreground.
5. Port the create, recovery-phrase confirmation, restore, unlock, home, and lock states to React Native.
6. Use the existing Ledgerly icon, colors, typography choices, copy style, and component geometry.
7. Port the safe native product surface: live XRP balances, issued-asset holdings, receive and X-address sharing, ledger activity, contacts, account selection, network switching, balance privacy, auto-lock controls, and test-network funding.

Transaction signing, recovery export, trust-line changes, account-secret import/export, Supabase contact/label sync, and store submission are intentionally not enabled in this PR. Email/password account authentication uses the existing Ledgerly Supabase project and remains separate from the local wallet vault.

## Production/development decision (2026-10-13)

The user chose to retain both existing phone implementations with separate roles: `mobile/` is the production candidate and `apps/mobile/` is the development sandbox. They share `src/ledgerly/core` and the native lifecycle/request helpers in `src/ledgerly/native`, and use different app identifiers, URL schemes, installed data, and EAS environments. The dev identifier is `com.accountabul.ledgerly.dev`; the production identifier remains `com.accountabul.ledgerly`. No existing on-device data is migrated or erased. See the root README for the source/build map.

The final ownership decision is one **Accountabul** Expo organization (`accountabuls`) containing **Ledgerly Production**, `@accountabuls/phone-app` (`f99f929c-665b-4dfd-b158-e2321226f637`), and **Ledgerly Development**, `@accountabuls/ledgerly-dev` (`8fbd1a0a-d66b-48db-9ea5-7706a30f24dc`). Development was transferred from the personal `accountabul` login without replacing its project ID. The personal login administers the organization and is not a separate environment. Each project keeps its own EAS configuration, build history, credentials, and environment variables. Development and `supabase/config.toml` use the ledgerly-test project `hwvyrlrmdktgfbqdmufz`. Production and the live website stay on `PRODUCTION_PROJECT_REF`.

An older personal Expo project was not referenced by either mobile configuration. Before the user-authorized removal, inspection found zero builds, no update branches or channels, no signing credentials, no submissions, no GitHub connection, and no hosting deployment. Its variables pointed to a different Supabase project (`ecoynpnkzbgvnfkzfsga`). Development, preview, and production variables plus the home-folder EAS link metadata were backed up locally under `.codex-temp/legacy-expo-audit/`. Expo subsequently confirmed that the old project ID no longer exists and that only the two Ledgerly projects remain. No Supabase database was deleted. The original home-folder `app.json` remains untouched; run EAS only in the designated app directories, not from the home folder.

The dev adapter's narrowly scoped `resumePendingBackup` reauthenticates only an unlocked wallet with an unconfirmed initial backup. It is not a general export API. Backgrounding clears UI recovery state, invalidates sensitive results and re-locks any create/unlock/reveal that finishes afterward. Home is gated by persisted `backupConfirmed`, including after restart. Account/network requests correlate their results before committing them to visible state.

## Active authentication backend

The live website and production builds use Supabase project `PRODUCTION_PROJECT_REF` (LedgerlyWallet.com). Development, including `apps/mobile` and `supabase/config.toml`, uses ledgerly-test (`hwvyrlrmdktgfbqdmufz`). The old `vsaouxymljdcbbsissom` Lovable Cloud backend retained historical profiles, including already-confirmed accounts; it is not the current web authentication project. The production public compatibility fallback stays on the live website's URL and publishable key. Development has no hardcoded fallback and takes its URL and publishable key from the development environment. Expo project IDs are unchanged. Splitting these profile backends does not move accounts, passwords, schemas, migrations, or on-device wallet vaults.

Confirmation email delivery is configured per hosted Supabase project under Authentication → Emails → SMTP Settings, independently of Vercel and EAS. A successful signup response for an already-confirmed address may be deliberately obfuscated and does not prove that a new email was sent. Sender credentials belong only in Supabase's encrypted SMTP configuration; never put them in EAS public variables or client code.

Custom SMTP was verified enabled on October 13, 2026, through the organization's Google Workspace SMTP relay with sender name **Ledgerly Wallet**, and an emulator signup confirmation was delivered. The sender mailbox and its credentials live only in Supabase's encrypted SMTP settings.

After changing Expo public variables, restart Metro or export with `--clear`: cached bundles can retain the previous backend even when `.env.local` has changed. Inspect the exported bundles and the running tunnel bundle before testing authentication. Updating EAS variables does not update an already-installed binary; distribute a new build when its configuration changes.

## Runtime isolation

The browser product keeps `WalletEngine` in a dedicated worker so UI dependencies do not share the heap containing decrypted keys. React Native does not provide the same boundary automatically.

The native UI adapter exposes lifecycle methods plus read-only ledger queries and local non-secret management methods. It does not expose transaction preparation, signing, recovery export, or account-secret import/export. The host uses native AES-GCM, retains the decrypted session only in memory, disables Android application backup, and locks on background. Before payments or signing are enabled, the engine must move behind an approved isolated runtime or native module boundary with a narrow allowlisted request protocol equivalent to `src/ledgerly/core/rpc/protocol.ts`.

Background tasks are not an acceptable isolation boundary because the operating system may suspend them and they do not provide a durable signing service.

## Native data flow

```text
React Native screens
        |
        | allowlisted native adapter
        v
WalletEngine (existing shared core)
        |                         |
        | encrypted records       | AES-GCM / secure random
        v                         v
Expo SQLite key-value store   expo-crypto native APIs

Unlocked payload + vault key -> memory only -> cleared on lock/background
```

No recovery phrase, family seed, private key, wallet password, or access token may be written to logs, analytics, crash reports, Supabase, or Expo configuration.

Supabase Auth uses only the public project URL and publishable client key supplied at build time. The authenticated session is stored through the platform keychain/keystore with Expo SecureStore. The service-role key and all administrative credentials are prohibited from the mobile runtime.

## Acceptance criteria for the foundation

- Android and iOS JavaScript bundles export successfully from the same source.
- TypeScript passes for the native project and the existing web project.
- The app starts without a WebView and renders native controls.
- Existing Ledgerly users can sign in with email and password, retain a validated session across launches, and sign out while locking the wallet.
- A wallet can be created or restored, locked, and unlocked using the existing engine.
- A generated recovery phrase must be acknowledged before the home state appears.
- Backgrounding the app clears the memory-only session.
- The unlocked native shell can read live balances, tokens, and history; share a receive address; manage contacts; switch accounts and networks; and update privacy and auto-lock preferences.
- Signing, transaction submission, and secret export remain unreachable from the native UI adapter.
- No newly designed logo, font, color system, or placeholder balance is introduced.
- No secrets or Expo credentials are committed.

## Release gates

Before TestFlight, internal Android testing, or store submission:

1. Synchronize the Lovable source with GitHub and resolve any UI/API drift.
2. Implement and threat-model the native engine isolation boundary.
3. Implement the isolated signing boundary, then port send and trust-line confirmation behavior without weakening the existing review step.
4. Port authenticated cloud contact and label synchronization behind the existing row-level-security policies; never embed an admin or service-role key.
5. Add automated native adapter tests and the shared wallet readiness suite.
6. Run create, restore, lockout, background lock, send, sign, submit, and recovery export tests on physical iOS and Android devices.
7. Complete Apple signing, Google Play signing/export custody, privacy declarations, export-compliance answers, and store metadata. EAS project linkage and permanent bundle identifiers are already configured.
