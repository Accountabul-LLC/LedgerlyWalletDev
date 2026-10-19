# Wallet contacts and recipient search

## Behavior

On the web wallet, typing a name or address in New/Edit Contact searches the
wallets already shown on Home and the saved address book. A suggestion shows its
name, full XRP Ledger address, whether it is your wallet or a saved contact,
destination tag when present, and saved note. Selecting it fills the contact
fields; the user can edit and save them. Search is local and case-insensitive,
with up to eight matches. Equivalent address/tag destinations are deduplicated;
different tags at one address remain distinct recipients.

Send uses the same suggestions, excluding the currently selected sending wallet
from the local-wallet candidates. Selection fills the address and saved tag,
including tag zero. A saved contact note is context only and never becomes a
public payment memo automatically. Editing the destination clears the previous
recipient's tag and context. Scanning a QR without a tag also clears an old tag.
Selection never prepares, signs or submits a payment. Normal review and explicit
confirmation remain required.

## Validation and storage

- Only checksum-valid XRPL classic addresses and X-addresses can be saved.
  Ethereum, Bitcoin, malformed and mistyped XRPL addresses are rejected. A valid
  address does not have to be funded already and is not proof of its owner.
- Invalid addresses disable Save in the UI and are also rejected in the worker.
- Optional destination tags must be whole unsigned 32-bit integers, including
  zero. The engine validates them independently of the form. A tag encoded in
  an X-address takes precedence and is read-only in the contact form.
- Ledgerly does not invent a destination tag or guess one from an address. The
  user supplies the recipient's tag, or uses the one already saved/encoded.
- Contact names remain limited to 40 characters and notes to 200. Existing
  encrypted contact storage and optional profile sync remain the source of
  truth; this feature adds no schema, backend endpoint or global user directory.

The web UI imports validation from the lightweight `core/shared` entry point.
The engine remains in its existing isolated runtime. The native apps receive
the shared engine tag validation; their screen search UI is outside this change.

## Verification

`tests/readiness/39-contact-recipients.test.ts` covers local name/address matching,
context, destination deduplication, distinct tags, invalid address/tag rejection,
X-address tags, tag zero, form prefilling, and Send's explicit review step. It
also verifies that selecting a contact does not copy its note into the memo or
automatically prepare a payment, and that changing the recipient clears old tags.

Rendered browser QA uses the real components with disposable local wallet and
contact fixtures. It verifies name suggestions below the contact Name field,
name/address prefilling, an invalid address disabling Save, and Send prefilling
tag zero while leaving the memo blank. No real wallet or payment is used.

Run `npm run typecheck`, scoped ESLint, the recipient tests and `npm run build`.
The broader local suite excludes the unchanged native Argon2 scheduling test
(`24-native-kdf-scheduling.test.ts`), which timed out at both 30 and 90 seconds
during the preceding Testnet task. That exclusion must be disclosed; it is not
a full-suite pass or release approval. Production deployment remains a separate
reviewed merge through the Lovable/Codex workflow.
