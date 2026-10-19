import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AddWallet } from '@ledgerly/ui';

export const Route = createFileRoute('/wallet/add')({
  head: () => ({
    meta: [
      { title: 'Add a wallet — Ledgerly' },
      {
        name: 'description',
        content:
          'Create another XRP Ledger wallet, start one with its own recovery phrase, or import an existing wallet from a seed.',
      },
      { property: 'og:title', content: 'Add a wallet — Ledgerly' },
      {
        property: 'og:description',
        content:
          'Create or import another XRP Ledger wallet. Keys are generated and encrypted on your device.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AddWalletPage,
});

function AddWalletPage() {
  const navigate = useNavigate();
  return <AddWallet onDone={() => void navigate({ to: '/wallet' })} />;
}
