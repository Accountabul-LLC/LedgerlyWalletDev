# Fix watch-only wallet list formatting

## Goal

Make the status pills on the watch-only balances page identical in size and shape, and add a clear visual divider between each wallet card.

## Current state

- `src/ledgerly/ui/views/ProfileBalances.tsx` renders each saved wallet as an `<article className="card stack">`.
- The top-right status uses `<span className="pill">` with text `Watch only`, `Needs activation`, or `Unavailable`.
- Wallet cards currently sit directly on top of one another with only a small gap; there is no separating line.

## Changes

1. **Uniform status pills**
   - Add a class to the wallet article (e.g., `profile-wallet`) so styles can be scoped to this list.
   - Target `.profile-wallet .pill` with:
     - fixed `min-height` (e.g., 28px)
     - consistent horizontal padding
     - a `min-width` wide enough for the longest label (`Needs activation`) so every pill occupies the same width
     - `justify-content: center` and `text-align: center`
   - Keep existing colors and text unchanged.

2. **Visible wallet separation**
   - Add a top border to every `.profile-wallet` except the first, using `.profile-wallet + .profile-wallet`:
     - `border-top: 1px solid var(--line)`
     - `padding-top: 18px` and `margin-top: 18px`
   - Alternatively, if the cards look better as fully separated panels, keep the existing card background and add the rule between them. The plan starts with the subtle divider because it preserves the current card surface.

3. **No wording/data/functionality changes**
   - Do not alter the pill labels, the balance values, the "Copy address" button, or the activation callout copy.
   - Do not change the page data flow.

## Files to edit

- `src/ledgerly/ui/views/ProfileBalances.tsx` — add `profile-wallet` class to each wallet article.
- `src/ledgerly/ui/styles.css` — add scoped `.profile-wallet` styles for pills and dividers.

## Verification

- Open `/balances` in the preview.
- Confirm all three status pills (`Watch only`, `Needs activation`, `Unavailable`) are the same height and width.
- Confirm a visible line separates each wallet card.
- Confirm no text, colors, or behavior changed.
