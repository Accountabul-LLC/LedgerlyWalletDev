import { createFileRoute } from '@tanstack/react-router';
import { Settings } from '@ledgerly/ui';

export const Route = createFileRoute('/wallet/settings')({
  head: () => ({
    meta: [
      { title: 'Settings — Ledgerly wallet' },
      {
        name: 'description',
        content: 'Manage accounts, networks, recovery and security preferences for your wallet.',
      },
      { property: 'og:title', content: 'Settings — Ledgerly wallet' },
      {
        property: 'og:description',
        content: 'Manage accounts, networks and security preferences.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: () => <Settings />,
});
