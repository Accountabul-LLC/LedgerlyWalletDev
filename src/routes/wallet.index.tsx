import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Dashboard, useViewMode } from '@ledgerly/ui';

export const Route = createFileRoute('/wallet/')({
  head: () => ({
    meta: [
      { title: 'Balances — Ledgerly wallet' },
      {
        name: 'description',
        content: 'Your XRP Ledger balances, reserves and quick actions in one place.',
      },
      { property: 'og:title', content: 'Balances — Ledgerly wallet' },
      {
        property: 'og:description',
        content: 'Your XRP Ledger balances, reserves and quick actions in one place.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: WalletHome,
});

function WalletHome() {
  const { viewMode, setViewMode } = useViewMode();
  const navigate = useNavigate();
  return (
    <Dashboard
      viewMode={viewMode}
      onFocusAccount={() => {
        setViewMode('single');
        void navigate({ to: '/wallet' });
      }}
    />
  );
}
