import { createFileRoute } from '@tanstack/react-router';
import { Tokens } from '@ledgerly/ui';

export const Route = createFileRoute('/wallet/tokens')({
  head: () => ({
    meta: [
      { title: 'Tokens and trust lines — Ledgerly' },
      {
        name: 'description',
        content: 'Add trust lines and track issued tokens held by your XRP Ledger account.',
      },
      { property: 'og:title', content: 'Tokens and trust lines — Ledgerly' },
      {
        property: 'og:description',
        content: 'Add trust lines and track issued tokens on the XRP Ledger.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: () => <Tokens />,
});
