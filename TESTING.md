# Checks

GitHub Actions runs these on every pull request and every push to `main`. None of them need repository secrets, so they also run on forks. `npm run check:all` runs the local subset.

| Job                   | What it checks                                                                     | Local command                                                 |
| --------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Typecheck             | `tsc --noEmit` for the web app, and for `mobile/` when that app is in the checkout | `npm run typecheck` and `npm run typecheck:mobile`            |
| Lint                  | ESLint with `eslint.config.js`                                                     | `npm run lint`                                                |
| Format                | Prettier                                                                           | `npm run format:check`                                        |
| Unit tests            | Vitest, plus a coverage report and XRPL parsing benches                            | `npm run test:coverage` and `npm run test:bench`              |
| Web build             | Production Vite / TanStack Start build                                             | `npm run build`                                               |
| Mobile                | `expo config` and `expo-doctor` when `mobile/` exists                              | `npm run check:mobile`                                        |
| npm audit             | Fails on high or critical advisories in production dependencies                    | `npm run audit:prod`                                          |
| Secret scan           | gitleaks over git history                                                          | `gitleaks detect --source . --config .gitleaks.toml --redact` |
| Dependency review     | A pull request must not introduce a high or critical production advisory           | `BASE_REF=main node scripts/ci/dependency-review.mjs`         |
| Client bundle secrets | No service-role key or private key in the client assets                            | `npm run check:secrets`                                       |
| Database              | Local Supabase migrations, RLS, schema lint, pgTAP                                 | `npm run check:db`                                            |
| Bundle size           | Client JS and CSS gzip size against `scripts/ci/bundle-budget.json`                | `npm run check:bundle`                                        |
| Lighthouse            | Home, security, privacy, and terms. Scores warn only                               | `npx @lhci/cli autorun` after `npm run build`                 |
| CodeQL                | JavaScript and TypeScript security queries                                         | GitHub Actions only                                           |

Coverage is reported and compared with `scripts/ci/coverage-baseline.json`. A drop does not fail the job. The current baseline is 30.37% lines, 30.37% statements, 52.94% functions, and 74.92% branches. The bundle budget is the measured gzip size plus 15 percent.

`mobile/` is not on `main` yet. Typecheck and Mobile succeed with a skip message until that directory exists. Database checks skip the same way when `supabase/migrations` has no SQL. In CI the database job is required to run, because the runner has Docker.

## Local setup

Use Node.js 24 and npm.

```sh
npm ci
npm run check:all
```

Database checks also need Docker and the Supabase CLI (`npm run check:db`). CI installs CLI 2.120.0 and runs `node scripts/ci/check-db.mjs --require`, which starts a local database, applies every migration, checks that row level security is on for every public table, runs `supabase db lint`, and runs the pgTAP files in `supabase/tests`.

The web build used by the bundle and Lighthouse jobs is given a placeholder publishable Supabase key. It is not a credential. Do not put a service-role key in `VITE_` variables.

## Branch protection

### Background browser history regression

Run a local server with synthetic configuration only:
`VITE_SUPABASE_URL=https://history-test.supabase.co` and
`VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_history_test_fixture`.
Run `node tests/browser/history-session.mjs` with Playwright installed, or set
`PLAYWRIGHT_MODULE` to its module URL. It launches headless Chrome, intercepts
all synthetic auth/data requests, and blocks other external traffic. No real
account, password, wallet, or provider is used. Override the local server URL
with `HISTORY_TEST_BASE_URL` (default `http://127.0.0.1:3000`).

Scenarios: signed-out Back/Forward; signed-in `/auth` redirects without rendering
credentials; sign-out followed by Back into an older protected entry; Forward
after sign-out. The cached-document lifecycle and stale validation races are
also covered by `tests/readiness/36-history-session.test.ts`.

Required status checks are a repository setting. Someone with admin access has to mark the jobs above as required on `main`. This repository is private, so GitHub's Dependency Review Action also needs the dependency graph and GitHub Advanced Security. The job in this suite uses the npm advisory database instead, and does not need that setting. CodeQL runs on every pull request and stores its SARIF file as a workflow artifact. An admin still has to enable code scanning before those results show on the Security tab.
