# Plan: "How Ledgerly protects your keys" security note

## Goal

Add an in-app security/privacy explainer so users understand how their keys are protected — covering the two design realities from the QA review (recovery phrase crossing the worker boundary, and web vs. extension isolation), plus the existing protections already in the UI.

## Where it lives

A new **"How Ledgerly protects your keys"** button in the existing **Security** panel of the Settings tab (`src/ledgerly/ui/views/Settings.tsx`, lines 143–171). Clicking it opens a **Dialog** (using the existing `Dialog` primitive from `components/primitives`) with the security note content. This keeps it discoverable exactly where a security-conscious user would look, without adding a new tab or route.

## What the dialog contains

Five sections using the user's approved copy (verbatim):

1. **Your keys stay on your device**
   Your wallet keys are generated directly on your device and encrypted locally using your password. Sensitive key operations take place inside an isolated Web Worker, and your private keys or recovery phrase are never intentionally uploaded to our servers. Only you can unlock your wallet.

2. **Your recovery phrase**
   Your 24-word recovery phrase is available only when you create your wallet or when you explicitly choose to reveal or export it after entering your password. We never store your recovery phrase. For added privacy, the phrase stays blurred until you select Reveal. You can also copy your recovery phrase when needed, but remember that anything copied to your clipboard may be accessible to other applications or browser extensions. For the safest backup, write your recovery phrase down and store it somewhere offline, private, and secure. Never share your recovery phrase with anyone. Anyone who has it can control your wallet.

3. **Encryption & auto-lock**
   Your wallet vault is encrypted using your password and a secure key-derivation process. Ledgerly automatically locks after your selected period of inactivity and locks when the wallet session is closed. Once locked, your password is required to regain access to your wallet and signing capabilities.

4. **Built for safety**
   Ledgerly is designed to minimize exposure of your private keys and recovery phrase. Sensitive wallet operations are isolated from the main interface wherever possible, and actions such as revealing your recovery phrase, exporting wallet credentials, or authorizing protected operations require authentication. Your password is an important layer of protection, but you should also keep your device, browser, and installed extensions secure.

5. **Web app vs. browser extension**
   The Ledgerly web wallet is designed with safeguards that limit access to sensitive wallet operations, including isolated key handling, restricted worker methods, password-protected exports, and authenticated signing. However, web applications operate within the security boundaries of the browser and webpage environment. For stronger isolation, the Ledgerly browser extension separates wallet functionality from ordinary website scripts and provides an additional layer of protection between your wallet and the websites you visit. We believe wallet security should be transparent, so we clearly explain both the protections Ledgerly provides and the security boundaries of each version.

## Files to change

1. **`src/ledgerly/ui/views/Settings.tsx`** — add a `security` case to the `Modal` union type, add a "How Ledgerly protects your keys" button to the Security panel, add a `SecurityNoteDialog` component that renders the four sections inside a `Dialog`.
2. **No new files, no new dependencies, no CSS changes** — uses existing `Dialog`, `Callout`, `Button` primitives and existing CSS classes (`stack`, `inline-note`, `callout`, `callout--positive`, etc.).

## Not changing

- No core engine logic, no key handling, no storage, no network code.
- No changes to onboarding flow (it already has appropriate callouts).
- No new routes or tabs.
