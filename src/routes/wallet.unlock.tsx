import { createFileRoute } from '@tanstack/react-router';
import { Unlock } from '@ledgerly/ui';

export const Route = createFileRoute('/wallet/unlock')({
  head: () => ({
    meta: [
      { title: 'Unlock your wallet — Ledgerly' },
      {
        name: 'description',
        content:
          'Enter your password to unlock the Ledgerly wallet stored in this browser. Keys never leave your device.',
      },
      { property: 'og:title', content: 'Unlock your wallet — Ledgerly' },
      {
        property: 'og:description',
        content: 'Enter your password to unlock the Ledgerly wallet stored in this browser.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Unlock,
});
