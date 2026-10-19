# XRP symbol provenance

`xrp-symbol.svg` reuses the unmodified black XRP symbol already supplied in `apps/mobile/assets/branding/xrp-symbol.svg`. Its recorded source is the official XRP Ledger brand kit, downloaded on 2026-10-14 from https://xrpl.org/XRPL_Brand_Kit.zip. This web build copy lets the standalone web export retain its own required asset. The ticker renders it locally without loading remote SVG.

The accompanying 2026 Brand Toolkit identifies this symbol with XRP / the XRP Ledger and specifies the supplied artwork rather than a recreation, black or white treatment, a minimum digital height of 20 pixels and clear space of one quarter of the symbol height. Ledgerly uses it only for native XRP asset identification. It does not use Ripple corporate branding or imply endorsement.

This is a brand asset, not an MIT-licensed Ledgerly icon. No general open-source license for this artwork was identified in the official kit; its use remains subject to the official brand guidelines and applicable trademark rights. Do not relicense, alter or reuse it as Ledgerly's app identity. The Ledgerly app mark remains the existing local Ledgerly asset.

The remaining interface icons in `apps/mobile/src/icons.tsx` are local vector drawings that follow Ledgerly's existing icon geometry and color palette. Issued-token logos are separately supplied by XRPL.to through the configured first-party proxy; they are display decoration and do not establish issuer trust.
