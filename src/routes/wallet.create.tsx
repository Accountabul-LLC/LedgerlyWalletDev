import { createFileRoute } from '@tanstack/react-router';
import { Onboarding } from '@ledgerly/ui';

export const Route = createFileRoute('/wallet/create')({
  head: () => ({
    meta: [
      { title: 'Set up your wallet — Ledgerly' },
      {
        name: 'description',
        content:
          'Create a new XRP Ledger wallet or restore one from a recovery phrase. Everything happens in this browser.',
      },
      { property: 'og:title', content: 'Set up your wallet — Ledgerly' },
      {
        property: 'og:description',
        content:
          'Create or restore an XRP Ledger wallet. Keys are generated and encrypted on your device.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Onboarding,
});
