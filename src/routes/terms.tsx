import { createFileRoute } from '@tanstack/react-router';
import { ContactEmailLink } from '@/ledgerly/ui/components/ContactEmail';
import { LegalPage, LegalSection } from '@/ledgerly/ui/components/LegalPage';
import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      { title: 'Terms of Service — Ledgerly' },
      {
        name: 'description',
        content:
          'The terms for using Ledgerly, a self custodial XRP Ledger wallet that runs in your browser and never holds your keys or your funds.',
      },
      { property: 'og:title', content: 'Terms of Service — Ledgerly' },
      {
        property: 'og:description',
        content:
          'The terms for using Ledgerly, a self custodial XRP Ledger wallet that runs in your browser.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://ledgerlywallet.com/terms' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://ledgerlywallet.com/terms' }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro="These terms cover your use of Ledgerly. Please read them before you create a wallet or move any value."
    >
      <LegalSection heading="1. Who we are">
        <p>
          Ledgerly is software published by the operator of this site, reachable at{' '}
          <ContactEmailLink />. In these terms "Ledgerly", "we" and "us" mean that operator, and
          "you" means the person using the app.
        </p>
      </LegalSection>

      <LegalSection heading="2. What Ledgerly is and is not">
        <p>
          Ledgerly is a self custodial wallet interface for the XRP Ledger. It generates and stores
          keys on your own device, and it helps you sign transactions and broadcast them to a public
          network you choose.
        </p>
        <p>
          Ledgerly is not a bank, exchange, broker, custodian, money transmitter or investment
          adviser. We never hold your keys, your recovery phrase, your password or your funds, we
          never take possession of anything you send, and we cannot move, freeze, reverse or recover
          a transaction for you.
        </p>
      </LegalSection>

      <LegalSection heading="3. Your account and your keys">
        <p>
          You are responsible for your recovery phrase, your wallet password and any device you use.
          Because keys stay with you, losing your phrase means losing access to the funds it
          controls, and no one, including us, can restore it. Anyone who obtains your phrase can
          spend your funds.
        </p>
        <p>
          An optional profile account, if you create one, only stores wallet nicknames and saved
          payees so they follow you between browsers. It is not a backup of your keys and it does
          not give us any control over your wallet.
        </p>
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>You agree not to use Ledgerly to:</p>
        <ul>
          <li>
            break any law that applies to you, including sanctions and anti money laundering law
          </li>
          <li>launder proceeds of crime or finance illegal activity</li>
          <li>
            attack, overload, reverse engineer or interfere with the app or the networks it reaches
          </li>
          <li>impersonate anyone or misrepresent your relationship to Ledgerly</li>
        </ul>
        <p>
          You confirm you are at least 18 years old and that using a self custodial wallet is legal
          where you live.
        </p>
      </LegalSection>

      <LegalSection heading="5. Third party services">
        <p>
          Ledgerly connects to public XRP Ledger servers, block explorers, token directories, test
          faucets and, if you use them, outside on ramp providers. Those services are run by other
          people under their own terms, and we do not control their availability, accuracy, fees or
          decisions.
        </p>
      </LegalSection>

      <LegalSection heading="6. No warranty">
        <p>
          Ledgerly is provided as is and as available, without warranties of any kind, whether
          express or implied, including merchantability, fitness for a particular purpose and non
          infringement. We do not promise the app will be uninterrupted, error free, or that any
          transaction will confirm.
        </p>
      </LegalSection>

      <LegalSection heading="7. Limitation of liability">
        <p>
          To the fullest extent the law allows, we are not liable for lost profits, lost value, lost
          data, lost recovery phrases, or any indirect, incidental, special, consequential or
          punitive damages arising from your use of Ledgerly. Our total liability for any claim is
          limited to one hundred United States dollars.
        </p>
      </LegalSection>

      <LegalSection heading="8. No financial advice">
        <p>
          Nothing in Ledgerly is financial, tax or legal advice, and nothing here is an offer to buy
          or sell any asset. Listing a token in the directory is not an endorsement. You decide what
          you hold and what you send, and you are responsible for your own tax reporting.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes and ending use">
        <p>
          We may update the app or these terms. When the change is meaningful we will update the
          date on this page. You can stop using Ledgerly at any time, and because your keys are
          yours, your wallet keeps working with any other XRP Ledger wallet that accepts your
          recovery phrase.
        </p>
      </LegalSection>

      <LegalSection heading="10. Governing law">
        <p>
          These terms are governed by the laws of the State of Missouri and applicable federal law
          of the United States, without regard to conflict of law rules. Any dispute will be brought
          in the state or federal courts located in Missouri, and you agree to that venue.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Questions about these terms can go to <ContactEmailLink />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
