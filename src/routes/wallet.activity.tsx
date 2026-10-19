import { createFileRoute } from '@tanstack/react-router';
import { Activity } from '@ledgerly/ui';

export const Route = createFileRoute('/wallet/activity')({
  head: () => ({
    meta: [
      { title: 'Activity — Ledgerly wallet' },
      {
        name: 'description',
        content: 'Recent payments, trust line changes and ledger activity for your account.',
      },
      { property: 'og:title', content: 'Activity — Ledgerly wallet' },
      {
        property: 'og:description',
        content: 'Recent payments and ledger activity for your XRP Ledger account.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: () => <Activity />,
});
