# Stop holding the recovery phrase during backup confirmation

You are right. Today the confirm screen keeps the whole phrase sitting in the page so the
"Back to phrase" button can show it again instantly. Nothing writes it to disk or sends it
anywhere, but it stays in browser memory longer than it needs to, and a bad extension or a
memory scrape has a wider window because of it.

## What changes for you

- On the confirm screen there is no longer a shortcut back to the full phrase. The button
  becomes "Show my phrase again", and it asks for your password first, the same way Settings
  and the resume-backup screen already do.
- After you leave the reveal screen, the phrase is dropped from the page. The confirm step
  keeps only what it needs to grade your three answers, not the words themselves.
- If you get a word wrong you can still retry as many times as you like, and you can still
  get back to the phrase, it just costs your password.

## How it works

- `src/ledgerly/ui/views/Onboarding.tsx`
  - The `verify` step no longer carries `mnemonic`. It carries the three word positions plus
    a SHA-256 digest of each expected word, salted with a random per-session value so the
    digests cannot be matched against the 2048-word list. Answers are hashed the same way and
    compared, so a correct answer is confirmed without the plaintext word being in state.
  - Leaving `BackupStep` clears the phrase from the step state.
  - "Back to phrase" is replaced by a password prompt that calls
    `wallet.exportRecoveryPhrase({ password })` and returns to `BackupStep` with a freshly
    decrypted phrase. This reuses the existing `ResumeBackup` component rather than adding a
    second password form.
  - `BackupStep` clears its local copy on unmount and re-blurs the grid.
- No changes to `src/ledgerly/core/`, which stays a mirror of upstream. The engine already
  requires the password for every reveal.

## Verification

- New checks in `tests/readiness/11-phrase-containment.test.ts`:
  - the verify step never receives the phrase as a prop or holds it in state,
  - the only route back to the phrase from confirm goes through a password reveal.
- Extend `tests/browser/phrase_leak.py`: after moving from reveal to confirm, assert the
  phrase words are absent from the page's live React state and from the DOM, and that
  clicking "Show my phrase again" presents a password field rather than the words.
- Run `bunx tsgo --noEmit` and the full readiness suite.
