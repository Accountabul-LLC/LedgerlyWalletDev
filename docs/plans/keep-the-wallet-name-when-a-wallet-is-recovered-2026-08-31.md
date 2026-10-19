# Keep the wallet name when a wallet is recovered

Today, removing a wallet from the device also erases its name everywhere: the local vault entry is gone and the synced name row is deleted from your profile. When you later restore that wallet from its recovery phrase, the app has nothing left to look the name up with, so it falls back to a generic name like "Imported r9cmQ..." and you have to rename it by hand.

## What changes

**1. Names are remembered, not erased**

Removing a wallet stops deleting its name. Instead the name is kept in two places:

- On the device: a small address-to-name memory that survives wallet removal (public addresses and names only, no secrets, no phrases).
- In your profile: the synced name row stays, marked as removed so it no longer shows up in the watch-only balances or profile wallet lists.

**2. Recovery restores the name silently**

When a wallet is added back (recovery phrase, family seed, or a fresh device restore), the app derives the address first, then looks the address up in device memory, then in your profile. If a remembered name exists, the wallet is restored under that name with no prompt. If nothing is remembered, current behavior is unchanged and the wallet gets its default name.

**3. Restoring the whole device**

After restoring from the master recovery phrase, the wallets derived from it also adopt their remembered names, so a fresh browser comes back looking like the old one instead of "Account 1, Account 2, Account 3".

**4. Clearing the memory stays possible**

Erasing everything on the device (the existing full reset) and deleting the profile both wipe the remembered names too, so "remembered" never means "permanent and unremovable".

## Technical notes

- Database: add a nullable `removed_at` timestamp to `wallet_labels`. `forgetWalletLabels` switches from `DELETE` to setting `removed_at = now()`; re-adding an address clears it. All read paths that list a user's wallets (profile balances, watch-only view, label sync pull) filter to `removed_at IS NULL`. Existing RLS policy already scopes rows to `auth.uid()` and needs no change.
- Local memory: a new `nameMemory` store in the existing IndexedDB layer under `src/ledgerly/ui/`, keyed by address, written on rename/create and on removal, read during import. Addresses and labels only; it never touches vault ciphertext or worker memory.
- Import path: `ImportAccountDialog` already derives the address in `previewImport` before adding anything. After the preview resolves, resolve a remembered name (local first, then profile when signed in) and pass it as the `label` on `addAccountWithOwnPhrase` / `importAccount`, so nothing extra is shown to the user.
- Device restore: after the master-phrase restore adds derived accounts, run the same lookup for each address and rename any account still holding a default `Account N` / `Wallet N` label.
- Sync: `syncLabels` keeps its "local wins unless the local name is still a default" rule; the recovered name arrives as a real name, so no reconciliation change is needed beyond the `removed_at` filter.
- Tests: add readiness checks that a removed-then-recovered wallet comes back with its old name, that removed labels stay out of profile/watch-only listings, and that the name memory contains no secret material.
