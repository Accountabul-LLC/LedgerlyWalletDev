import { createFileRoute } from '@tanstack/react-router';
import { SiteHeader } from '@/ledgerly/ui/components/SiteHeader';
import { SiteFooter } from '@/ledgerly/ui/components/SiteFooter';
import { WalletDirectory } from '@/ledgerly/ui/components/WalletDirectory';

import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/wallets')({
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://ledgerlywallet.com/wallets' }],
    meta: [
      { property: 'og:url', content: 'https://ledgerlywallet.com/wallets' },
      { title: 'XRP Ledger Wallets We Recommend | Ledgerly' },
      {
        name: 'description',
        content:
          'Download trusted XRP Ledger wallets: Joey Wallet and Xaman. Sign in to Ledgerly with them is coming soon.',
      },
      { property: 'og:title', content: 'XRP Ledger Wallets We Recommend | Ledgerly' },
      {
        property: 'og:description',
        content:
          'A short directory of XRPL wallets with official download links. Ledgerly stays self custodial either way.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: WalletsPage,
});

function WalletsPage() {
  return (
    <div className="shell">
      <SiteHeader />
      <main className="landing">
        <section className="landing-hero">
          <span className="card-eyebrow">XRPL wallets</span>
          <h1>Wallets for the XRP Ledger</h1>
          <p className="landing-lede">
            Ledgerly is not the only good wallet on the XRP Ledger. These are well known XRPL
            wallets you can download today. Support for signing in to Ledgerly with them is on the
            way.
          </p>
        </section>

        <section className="card card--plain" aria-label="Wallet downloads">
          <WalletDirectory />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
