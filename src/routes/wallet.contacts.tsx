import { createFileRoute } from '@tanstack/react-router';
import { Contacts } from '@ledgerly/ui';

export const Route = createFileRoute('/wallet/contacts')({
  head: () => ({
    meta: [
      { title: 'Contacts — Ledgerly wallet' },
      {
        name: 'description',
        content: 'Save trusted XRP Ledger addresses so sending is quick and mistake free.',
      },
      { property: 'og:title', content: 'Contacts — Ledgerly wallet' },
      {
        property: 'og:description',
        content: 'Save trusted XRP Ledger addresses for faster sending.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: () => <Contacts />,
});
