import { createFileRoute } from '@tanstack/react-router';
import { ContactActions } from '@/ledgerly/ui/components/ContactEmail';
import { LegalPage, LegalSection } from '@/ledgerly/ui/components/LegalPage';
import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/contact')({
  validateSearch: (search: Record<string, unknown>): { topic?: 'security' } =>
    search.topic === 'security' ? { topic: 'security' } : {},
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://ledgerlywallet.com/contact' }],
    meta: [
      { property: 'og:url', content: 'https://ledgerlywallet.com/contact' },
      { title: 'Contact — Ledgerly' },
      {
        name: 'description',
        content: 'Write to Ledgerly. Copy the address or open it in your email app.',
      },
      { property: 'og:title', content: 'Contact — Ledgerly' },
      { property: 'og:type', content: 'website' },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { topic } = Route.useSearch();
  const security = topic === 'security';

  return (
    <LegalPage
      eyebrow="Contact"
      title={security ? 'Report a security issue' : 'Contact'}
      intro={
        security
          ? 'Copy the address below, or open it in your email app. Put SECURITY in the subject line.'
          : 'Copy the address below, or open it in your email app if you have one on this device.'
      }
    >
      <LegalSection heading="Email">
        <ContactActions subject={security ? 'SECURITY' : undefined} />
      </LegalSection>
    </LegalPage>
  );
}
