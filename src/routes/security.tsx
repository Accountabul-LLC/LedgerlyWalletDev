import { createFileRoute } from '@tanstack/react-router';
import { ContactEmailLink } from '@/ledgerly/ui/components/ContactEmail';
import { LegalPage, LegalSection } from '@/ledgerly/ui/components/LegalPage';
import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/security')({
  head: () => ({
    meta: [
      { title: 'Security and Bug Reporting — Ledgerly' },
      {
        name: 'description',
        content:
          'How Ledgerly protects your keys on your own device, what we ask of you, and how to report a security issue responsibly.',
      },
      { property: 'og:title', content: 'Security and Bug Reporting — Ledgerly' },
      {
        property: 'og:description',
        content:
          'How Ledgerly protects your keys on your device and how to report a security issue.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://ledgerlywallet.com/security' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://ledgerlywallet.com/security' }],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <LegalPage
      eyebrow="Security"
      title="Security and bug reporting"
      intro="How your keys are handled inside Ledgerly, and how to tell us if you find something wrong."
    >
      <LegalSection heading="How your keys are handled">
        <ul>
          <li>Keys and recovery phrases are generated in your browser, never on a server.</li>
          <li>
            Your vault is encrypted locally with AES-256-GCM and an Argon2id-derived key from your
            wallet password before it is written to browser storage.
          </li>
          <li>
            Unlocked key material lives in an isolated worker in memory. Closing the tab ends that
            session and you unlock again next time.
          </li>
          <li>
            Signing happens on your device. Only the signed transaction goes out to the public
            network.
          </li>
          <li>
            Ledgerly does not send your recovery phrase, private keys or wallet unlock password to
            our servers. We cannot reset or recover those secrets for you. Your profile sign-in
            password, if you use one, is separate and is sent to the authentication service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="What we ask of you">
        <ul>
          <li>Write your recovery phrase down offline and keep it somewhere private.</li>
          <li>Use a strong, unique wallet password.</li>
          <li>Lock the wallet when you step away from a shared computer.</li>
          <li>Confirm you are on the real Ledgerly address before you unlock.</li>
          <li>Never type or paste your phrase into anything except a wallet you trust.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Audit our code">
        <p>
          The parts of Ledgerly that hold your keys are public, so you never have to take our word
          for any of this. Key generation, encryption, the vault format, transaction building and
          signing are all published and readable.
        </p>
        <ul>
          <li>
            Key generation and encryption: how your recovery phrase is created, how your password
            protects it, and the parameters used.
          </li>
          <li>
            The vault format: exactly what is written to browser storage and in what encrypted
            shape.
          </li>
          <li>
            Derivation and signing: the standard path your addresses come from, and the fact that
            the signer never hands a key back out.
          </li>
          <li>
            Transaction building: how amounts, addresses, fees and destination tags are checked
            before anything is signed.
          </li>
          <li>
            Worker isolation and the extension shell, so the extension you installed can be rebuilt
            from the same source.
          </li>
          <li>Our key-safety tests and every security audit write-up we have done.</li>
        </ul>
        <p>
          The web wallet still depends on the code delivered by this site and the security of your
          device. Worker isolation and encryption do not protect against every compromised device,
          malicious browser extension or malicious page script. Public addresses and transactions
          can be linked on the ledger; Ledgerly does not provide transaction anonymity.
        </p>
        <p>
          Each publish is tagged to match a released extension version and ships a checksum list, so
          you can compare what you installed against what we published. Want a specific file or
          release checked? Email <ContactEmailLink /> and we will point you straight at it.
        </p>
      </LegalSection>

      <LegalSection heading="Reporting a vulnerability">
        <p>
          If you find a security issue, email <ContactEmailLink topic="security" /> with the subject
          line "Security report". Please include what you found, the steps to reproduce it, and the
          impact you think it has. A screenshot or short recording helps.
        </p>
        <p>
          We aim to acknowledge reports within five business days and will keep you posted while we
          work on a fix. Never include your recovery phrase, private keys or password in a report.
        </p>
      </LegalSection>

      <LegalSection heading="Please do not">
        <ul>
          <li>run denial of service tests or spam the app or the public servers it uses</li>
          <li>access, modify or destroy data belonging to anyone else</li>
          <li>use social engineering against users or anyone connected to the project</li>
          <li>publish details of an unfixed issue before we have had a chance to respond</li>
        </ul>
        <p>
          We do not currently run a paid bounty program, and we appreciate every good faith report
          all the same.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
