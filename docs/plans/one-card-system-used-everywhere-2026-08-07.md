# One card system, used everywhere

Right now every surface is its own hand-written block: `.panel`, `.balance-card`, `.faucet-card`, `.unified-total`. Each new section means another set of padding, radius, border, and shadow values, and they drift. Replace all of it with a single card that has two skins.

## The card

One base class owns shape and spacing for every surface in the app: radius, padding, border, shadow, and the internal eyebrow/title/body rhythm. Two skins sit on top:

- **Feature** — the dark treatment from the balance card: near-black ground, the soft lime and violet orbs, the diagonal light wash, white text. Used for the one surface that leads a screen.
- **Plain** — the light paper surface, same shape and rhythm, hairline border. Used for everything underneath.

Nothing else. A new section picks a skin and gets consistent styling for free.

## What changes on screen

The "All wallets" total becomes the feature card, matching the single-wallet balance card exactly: dark ground, orbs, network chip, the big figure, Send and Receive. Today it is a flat white box with a lime button, which is why the unified view looks like a different app than the single-wallet view.

"Balance by wallet", the faucet card, and the Tokens and Activity panels all move to the plain skin. They already look close, so the visible change is small: uniform radius, padding, and shadow, and the same eyebrow and title treatment throughout.

Only one feature card appears per screen. Two dark cards stacked would fight each other, so the faucet card stays plain even though it sits directly under a dark card.

## Technical notes

- Add card tokens to `src/ledgerly/ui/styles.css`: surface, ink, border, radius, padding, and shadow, defined once and referenced by both skins rather than repeated per component.
- New classes: `.card`, `.card--feature`, `.card--plain`, plus `.card-eyebrow`, `.card-title`, `.card-actions` for the shared internals.
- `.panel`, `.faucet-card`, `.unified-total` and their descendant rules are deleted, not aliased. Their call sites in `Dashboard.tsx`, `Tokens.tsx`, `Activity.tsx`, and `Settings.tsx` move to the card classes.
- The orb elements move inside the feature skin so a component never has to render them by hand.
- Existing dark-on-light contrast pairs are kept, so the address row, chips, and links stay legible on both skins.
