# LedgerlyWalletDev

LedgerlyWalletDev repo: the public development copy, published from a cleaned snapshot with no prior history. MIT licensed (see `LICENSE`). Do not commit credentials, `.env` files, production project refs or customer data.

## Ledgerly Wallet

## Phone apps: production and development

| Role                 | Source directory | Installed app ID               | EAS environment |
| -------------------- | ---------------- | ------------------------------ | --------------- |
| Production candidate | `mobile/`        | `com.accountabul.ledgerly`     | `production`    |
| Development sandbox  | `apps/mobile/`   | `com.accountabul.ledgerly.dev` | `development`   |

The **Accountabul** Expo organization (technical identifier `accountabuls`) owns both projects: **Ledgerly Production** (`@accountabuls/phone-app`) and **Ledgerly Development** (`@accountabuls/ledgerly-dev`). The personal login `accountabul` manages the organization; it is not a separate development environment. The development app displays **Ledgerly Dev** and uses the `ledgerly-dev` URL scheme. The apps share the engine in `src/ledgerly/core` and have separate on-device app data. A fix to shared engine/native helpers applies to both; a screen fix must be verified in both shells.

Run Expo/EAS commands inside the intended directory, never from the repository root. Use `apps/mobile` for daily experiments and `mobile` for reviewed production candidates. Each Expo project owns its own environment variables and build credentials. Development and `supabase/config.toml` use the ledgerly-test project `hwvyrlrmdktgfbqdmufz`. Production, including the live website, stays on `PRODUCTION_PROJECT_REF`. The retired project `vsaouxymljdcbbsissom` is not an active authentication backend. Do not use real funds for sandbox testing. See the [production app guide](mobile/README.md) and [development app guide](apps/mobile/README.md).

The production designation selects the release path; it is not a security/release approval. Native signing isolation, physical-device QA, and signing/store requirements remain release gates. Changes reach `main` through reviewed merge-commit PRs only.

[Ledgerly](https://ledgerlywallet.com) is a self-custodial XRP Ledger wallet that runs in your browser. Create or import wallets, view XRP and token balances, and send and receive payments on Mainnet, Testnet, or Devnet.

## Key custody

Wallet keys and recovery phrases are generated or imported on your device and stored in an encrypted browser vault. A profile supports conveniences such as wallet names and saved payees; it does not hold your private keys or recovery phrase.

Keep your recovery phrase backed up somewhere safe. Browser storage is specific to the device, browser, and site origin. Clearing it or switching domains does not transfer your wallet, and a profile password reset cannot recover your wallet keys.

## Local development

Use Node.js 24 and npm.

```sh
git clone https://github.com/Accountabul-Business-Account/Ledgerly-Wallet.git
cd Ledgerly-Wallet
npm ci
cp .env.example .env.local
npm run dev
```

Configure the publishable Supabase coordinates in `.env.local` for your development project. Never commit environment files or put service-role keys or cron secrets in client-exposed variables.

Homepage token prices use the anonymous XRPL.to feed. Issued-token logos use
public XRPL Meta metadata keyed by currency and issuer, with no API key required.
Absent or failed logos show a fallback badge.
See [the ticker contract](docs/architecture/home-token-ticker.md).

## Checks and builds

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run preview
```

Additional maintenance scripts, including the full readiness workflow, use Bun. See [the test guide](tests/README.md) for test coverage and [package.json](package.json) for available commands.

## Project structure

The homepage includes a scrolling XRPL market strip with USD prices and signed
24-hour changes. It reads XRPL.to's public token feeds directly in the browser;
see [the data contract and verification guide](docs/architecture/home-token-ticker.md).

- `src/routes/`: TanStack Start file-based routes and the application shell.
- `src/ledgerly/`: wallet core, browser integration, and UI.
- `supabase/`: database configuration and migrations.
- `public/`: static assets, robots.txt, and the sitemap.
- `tests/`: automated readiness and browser checks.
- `extension/`: browser extension sources.
- `scripts/`: security, audit, build, and maintenance utilities.

## Deployment

The `ledgerly` Vercel project deploys production from `main`. Review changes in a pull request before merging. The production domain is [ledgerlywallet.com](https://ledgerlywallet.com).

Builds use the standalone Vite, TanStack Start, React, Tailwind and Nitro plugins. Nitro emits Vercel's Build Output API when `VERCEL=1`; local builds use the Node server preset. Install with `npm ci` to preserve the checked-in dependency versions.

Supabase handles email/password, Google OAuth, profile sessions and password recovery. Configure the Google provider in the production Supabase project with your Google OAuth credentials. Set the Google application's authorized redirect URI to `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. In Supabase Auth URL Configuration, set the site URL to `https://ledgerlywallet.com`. Allow `https://ledgerlywallet.com/auth/confirm`, `https://ledgerlywallet.com/auth/callback`, and `https://ledgerlywallet.com/reset-password`, plus the same three paths on each Vercel preview origin. Email confirmation finishes on `/auth/confirm`. The hosted project does not read `supabase/config.toml`: keep confirmations enabled in the dashboard, and paste `supabase/templates/confirmation.html` into the Confirm signup email template. OAuth and recovery links must be completed in the browser that started the PKCE flow. The confirmation template's `token_hash` link can be opened on any device.

Server errors appear in Vercel Runtime Logs. Client error boundaries keep diagnostics local and do not upload wallet-screen contents. Auth sessions remain in this site's browser storage; they are not shared with any editor.

Configure server-only credentials in the deployment environment, not in the repository. Keep canonical URLs and the sitemap aligned with the production domain, and preserve wallet-origin compatibility when changing domains.

## Security

Browser history does not authenticate a profile. Visiting `/auth` with a current,
server-validated profile redirects before the sign-in form renders. Sign-out clears
cached profile queries. Restoring a document from the browser's Back/Forward cache
reloads it with route authorization and a fresh, locked wallet worker. Profile
session persistence is unchanged; sign out when leaving a shared device.

Read [how keys are protected](https://ledgerlywallet.com/security) and the [security center](https://ledgerlywallet.com/security-center). Report vulnerabilities through the [security contact page](https://ledgerlywallet.com/contact?topic=security); do not post keys, recovery phrases, or passwords in issues or pull requests.
