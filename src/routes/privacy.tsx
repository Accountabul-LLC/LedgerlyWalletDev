import { createFileRoute } from '@tanstack/react-router';
import { ContactEmailLink } from '@/ledgerly/ui/components/ContactEmail';
import { LegalPage, LegalSection } from '@/ledgerly/ui/components/LegalPage';
import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy Policy — Ledgerly' },
      {
        name: 'description',
        content:
          'What Ledgerly collects and what it never sees. Your keys, recovery phrase and wallet password stay on your device and never reach our servers.',
      },
      { property: 'og:title', content: 'Privacy Policy — Ledgerly' },
      {
        property: 'og:description',
        content:
          'Your keys, recovery phrase and wallet password stay on your device and never reach our servers.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://ledgerlywallet.com/privacy' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://ledgerlywallet.com/privacy' }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="Ledgerly is built so that the most sensitive parts of your wallet never leave your device. This page explains exactly what stays local and what we can see."
    >
      <LegalSection heading="What we never receive">
        <ul>
          <li>your recovery phrase or seed</li>
          <li>your private keys</li>
          <li>your wallet unlock password</li>
        </ul>
        <p>
          Recovery phrases and private keys are generated or imported on your device and stored in a
          locally encrypted vault. Your wallet unlock password derives the encryption key locally
          and is never sent to us. We cannot recover those secrets. A profile sign-in password is
          separate and is sent to the authentication service.
        </p>
      </LegalSection>

      <LegalSection heading="What stays on your device">
        <p>
          Your encrypted vault, your wallet list, your unlocked session and your local preferences
          live in this browser only. Clearing site data for this browser removes them, so keep your
          recovery phrase written down somewhere safe.
        </p>
      </LegalSection>

      <LegalSection heading="What we store if you create a profile">
        <p>
          A profile account is optional. If you make one, our backend stores your email address, the
          sign in method you chose, and the convenience data you save such as wallet nicknames,
          saved payees and public wallet addresses. That data is tied to your account so it can
          follow you to another browser. Public addresses are already visible on the ledger, and we
          store no secret material with them.
        </p>
      </LegalSection>

      <LegalSection heading="Network requests">
        <p>
          To show balances, tokens and history the app talks to public XRP Ledger servers, block
          explorers and token directories. Those services can see your IP address and the address
          you are looking up, under their own privacy policies. Everything you broadcast to the XRP
          Ledger is public and permanent by design.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and analytics">
        <p>
          We use the storage needed to keep you signed in to a profile and to hold your local wallet
          data. Activity reporting stores event type, network, a random browser identifier, wallet
          fingerprints and public transaction hashes. Activation checks send a public address to our
          server and the ledger; the event stores a fingerprint rather than the raw address.
          Transaction hashes can be looked up on the public ledger. Public counters expose only
          totals by network. We do not sell personal information and we do not share it with
          advertisers.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          A profile is required to use Ledgerly. You can ask us to delete it and the data attached
          to it by writing to <ContactEmailLink />. Deleting a profile does not touch your wallet,
          because your wallet was never ours to hold.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          Ledgerly is not intended for anyone under 18 and we do not knowingly collect their data.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and contact">
        <p>
          If this policy changes we will update the date at the top of the page. Questions go to{' '}
          <ContactEmailLink />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
