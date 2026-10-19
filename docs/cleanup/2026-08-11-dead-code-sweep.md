# Dead code sweep — 2026-08-11

Scope: full sweep of `src/`, `scripts/`, `extension/`, `tests/` after the platform metrics
work, as part of the pre-release skill run.
Result: 0 deleted, 0 to finish, 11 kept, 0 need a decision.
Verification: typecheck PASS, tests PASS (92/92).

## Deleted

Nothing. The previous sweep already removed the dead surface, and no new orphan has
appeared since.

## Needs finishing

| Item | Where | Connecting code that expects it | What is missing |
| ---- | ----- | ------------------------------- | --------------- |
| —    | —     | —                               | —               |

No unfinished markers exist: zero `TODO`, `FIXME`, `XXX`, `HACK`, `@deprecated`, or
"not implemented" throws outside the upstream mirror.

## Kept (looked dead, is not)

| Item                                                   | Why it stays                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/router.tsx`                                       | Framework entry point; referenced by the build, not by an import from app code.                   |
| `.button--primary`, `.button--danger`                  | Class name built by concatenation in `components/primitives.tsx` (`button--${variant}`).          |
| `.callout--positive`, `.callout--caution`              | Built by `callout--${tone}` in the same file.                                                     |
| `.status-dot--connecting`, `--disconnected`, `--error` | Built by `status-dot--${status}` in `ui/App.tsx`.                                                 |
| `.shell--web`                                          | Built by `shell--${surface}` in `ui/App.tsx`.                                                     |
| `.dark` in `src/styles.css`                            | Theme variant applied at the document root, not through a `className` literal.                    |
| `console.log` in `scripts/*`                           | Intentional CLI output for the sync, readiness, and extension build scripts, not debug leftovers. |
| Everything under `src/ledgerly/core/`                  | Upstream mirror; unused exports there are upstream surface area.                                  |

## Backend surface

Every server function and endpoint has a live caller: `fetchPlatformTotals` and
`recordSignedPaymentValue` from the app, the token functions from the token picker, and
`/api/public/tokens/sync` from the scheduled refresh. No orphaned RPC, table, or route.

## Notes

`bun run core:check` reports the upstream drift check could not reach the GitHub API in this
environment. That is a network condition in the sandbox, not drift, and it does not block.
