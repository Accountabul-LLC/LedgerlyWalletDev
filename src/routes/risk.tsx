import { createFileRoute, Link } from '@tanstack/react-router';
import { LegalPage, LegalSection } from '@/ledgerly/ui/components/LegalPage';
import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/risk')({
  head: () => ({
    meta: [
      { title: 'Risk Disclosure — Ledgerly' },
      {
        name: 'description',
        content:
          'What can go wrong when you hold your own keys: irreversible payments, a lost recovery phrase, price swings, wrong addresses and scam tokens.',
      },
      { property: 'og:title', content: 'Risk Disclosure — Ledgerly' },
      {
        property: 'og:description',
        content:
          'Irreversible payments, lost phrases, price swings and scam tokens. Read this before you move real value.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://ledgerlywallet.com/risk' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://ledgerlywallet.com/risk' }],
  }),
  component: RiskPage,
});

function RiskPage() {
  return (
    <LegalPage
      eyebrow="Before you start"
      title="Risk Disclosure"
      intro="Holding your own keys gives you full control, and full responsibility. Here is what that really means."
    >
      <LegalSection heading="Payments cannot be undone">
        <p>
          Once a transaction is validated on the XRP Ledger it is final. There is no chargeback, no
          support line that can claw it back, and no way for us to reverse it. Check the address and
          the amount every single time, and send a small test payment first when the amount matters.
        </p>
      </LegalSection>

      <LegalSection heading="Lose the phrase, lose the funds">
        <p>
          Your recovery phrase is the only way back into your wallet. If you lose it, or if you
          clear this browser without having written it down, the funds are gone permanently. If
          someone else sees it, they can take everything without needing your password.
        </p>
      </LegalSection>

      <LegalSection heading="Prices move">
        <p>
          XRP and issued tokens can change in value quickly and can lose value entirely. Only hold
          what you can afford to lose, and do not treat any balance shown here as a guarantee of
          what it will be worth later.
        </p>
      </LegalSection>

      <LegalSection heading="Tokens are not vetted">
        <p>
          Anyone can issue a token on the XRP Ledger, including a token that copies the name and
          logo of a real one. Appearing in the directory or in your balances is not an endorsement.
          Confirm the issuer address from a source you trust before you set a trust line or trade.
        </p>
      </LegalSection>

      <LegalSection heading="Account requirements and fees">
        <p>
          The XRP Ledger holds a small reserve on every account and on each trust line, so part of
          your balance is not spendable. Each transaction also burns a small network fee. These are
          set by the network, not by us.
        </p>
      </LegalSection>

      <LegalSection heading="Test networks are not real">
        <p>
          Testnet and Devnet exist for practice. Balances there have no value, and those networks
          can be reset without notice. Watch for the test badge in the app so you always know which
          network you are on.
        </p>
      </LegalSection>

      <LegalSection heading="Scams target wallet users">
        <p>
          No one from Ledgerly will ever ask for your recovery phrase or your password. Anyone who
          does is trying to rob you. Be careful with links, support chats, giveaways and browser
          extensions that ask you to paste your phrase.
        </p>
      </LegalSection>

      <LegalSection heading="Software has bugs">
        <p>
          Ledgerly is provided without warranty. Bugs, outages and problems with the public servers
          it depends on can prevent you from seeing or sending funds at any given moment. Read the{' '}
          <Link to="/terms">Terms of Service</Link> and our{' '}
          <Link to="/security">security page</Link> for more.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
