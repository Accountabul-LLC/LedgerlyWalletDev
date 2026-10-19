# Environments

Nothing touches production unless the project owner explicitly says `push this to production`.

That includes database writes, activity counters, deploys, EAS submissions, and copying production credentials into a dev, preview, or local build. A merge to `main` is not that instruction.

## Dev/test and production

There is one Git repository, [Ledgerly-Wallet](https://github.com/Accountabul-Business-Account/Ledgerly-Wallet). Development happens on branches in that repo. Production data and the live site are separate projects.

|                   | Dev/test                                      | Production                                                                 |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| Supabase          | ledgerly-test, ref `hwvyrlrmdktgfbqdmufz`     | LedgerlyWallet.com, ref `PRODUCTION_PROJECT_REF`                           |
| Supabase API host | `https://hwvyrlrmdktgfbqdmufz.supabase.co`    | `https://PRODUCTION_PROJECT_REF.supabase.co`                               |
| Vercel project    | `ledgerly-test`                               | `ledgerly`                                                                 |
| Vercel project id | `prj_TEST_PROJECT_ID_PLACEHOLDER`             | `prj_LIVE_PROJECT_ID_PLACEHOLDER`                                          |
| Public site       | `ledgerly-test.vercel.app`                    | `ledgerlywallet.com` and `www.ledgerlywallet.com`                          |
| Phone source      | `apps/mobile` (Ledgerly Dev)                  | `mobile` (production candidate)                                            |
| EAS project       | `@accountabuls/ledgerly-dev`                  | `@accountabuls/phone-app`                                                  |
| EAS environment   | `development` for every `apps/mobile` profile | `production` for the production profile; `preview` for the preview profile |

The `ledgerly-test` Vercel project has its own Production, Preview, and Development targets. Those targets are still the test site. They must use the ledgerly-test Supabase project, never the production ref.

The production phone preview profile sets `EXPO_PUBLIC_LEDGERLY_BACKEND=test` and takes Supabase coordinates from that profile's env. It must not fall back to the production project. Production phone builds may still fall back to the live project when their EAS production environment does not supply coordinates.

## Environment variables

Names only. Values live in Vercel, EAS, or a gitignored local env file. Never commit them.

### Vercel `ledgerly` (production site)

Set these on the **Production** target, pointed at Supabase `PRODUCTION_PROJECT_REF`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_ANON_KEY`

Server-only, Production target. Do not copy these to Preview, Development, or `ledgerly-test`, and never put them in `VITE_` or `EXPO_PUBLIC_` variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_JWT_SECRET`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`
- `AUDIT_CRON_SECRET`
- `TOKEN_SYNC_SECRET`
- `XRPL_TO_API_KEY`
- `XRPL_TO_REDISTRIBUTION_APPROVED`

Preview and Development on `ledgerly` currently still carry the production Supabase URL. Do not rely on that. Activity writes from those builds are refused in code. Retargeting those Vercel targets is a dashboard change and is not done from this repo.

### Vercel `ledgerly-test`

Set the same publishable `VITE_`, `SUPABASE_`, and `NEXT_PUBLIC_` Supabase names on Production, Preview, and Development, pointed at Supabase `hwvyrlrmdktgfbqdmufz`. Do not set production service-role keys, database passwords, or cron secrets here.

### Activity counter

Empty means reporting is off. Dev, preview, and local builds must not send counters to production.

| Variable                   | Where           | What to set                                    |
| -------------------------- | --------------- | ---------------------------------------------- |
| `VITE_ACTIVITY_URL`        | Vercel, client  | See targets below                              |
| `ACTIVITY_URL`             | Vercel, server  | Same endpoint as `VITE_ACTIVITY_URL`, or empty |
| `EXPO_PUBLIC_ACTIVITY_URL` | EAS, not Vercel | See targets below                              |

- `ledgerly` Production: leave all three unset. `VERCEL_ENV=production` together with this project's id keeps `https://ledgerlywallet.com/api/public/activity`.
- `ledgerly` Preview and Development: leave all three unset. Do not set the production URL.
- `ledgerly-test` Production, Preview, and Development: set `VITE_ACTIVITY_URL` and `ACTIVITY_URL` to that deployment's own `/api/public/activity` (the `ledgerly-test.vercel.app` origin) only if test counters should be recorded. Never set them to `ledgerlywallet.com`.
- EAS `production` (the `mobile` production profile): leave `EXPO_PUBLIC_ACTIVITY_URL` unset. A production release keeps the live endpoint.
- EAS `preview`: leave `EXPO_PUBLIC_ACTIVITY_URL` unset, or set the ledgerly-test activity URL. `EXPO_PUBLIC_LEDGERLY_BACKEND=test` already skips the send. Do not set the production URL.
- EAS `development` and local Expo: leave `EXPO_PUBLIC_ACTIVITY_URL` unset, or set a ledgerly-test or localhost activity URL. A local Metro session does not report to production.
- Local web: leave `VITE_ACTIVITY_URL` and `ACTIVITY_URL` empty unless Supabase is ledgerly-test and the URL is localhost or the test site.

### EAS variable names

`mobile` production environment:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_ACTIVITY_URL` (optional; see above)
- `EXPO_PUBLIC_MARKET_API_ORIGIN` (optional)

`mobile` preview environment:

- `EXPO_PUBLIC_LEDGERLY_BACKEND` (`test`)
- `EXPO_PUBLIC_SUPABASE_URL` (ledgerly-test)
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ledgerly-test)
- `EXPO_PUBLIC_ACTIVITY_URL` (optional; never the production site)

`apps/mobile` development environment:

- `EXPO_PUBLIC_SUPABASE_URL` (ledgerly-test; this app has no production fallback)
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_MARKET_API_ORIGIN` (optional)

## CI

`tests/readiness/47-production-ref-guard.test.ts` runs with `npm test` in the existing unit-test job. It fails if `PRODUCTION_PROJECT_REF` or `PRODUCTION_PROJECT_REF.supabase.co` appears outside the production phone fallback, the production EAS profile, production docs, the OSS redaction pattern, the production-fallback assertion, SEO or fixture files that legitimately name production, the activity-counter refusal check in `src/lib/activity-report.ts`, and the activity-isolation fixture in `tests/readiness/36-phone-activity.test.ts`. `supabase/config.toml` names the ledgerly-test project `hwvyrlrmdktgfbqdmufz` and is not allowlisted.
