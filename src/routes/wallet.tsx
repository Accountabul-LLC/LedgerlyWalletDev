import {
  createFileRoute,
  ClientOnly,
  Outlet,
  useNavigate,
  useRouterState,
  redirect,
} from '@tanstack/react-router';
import { lazy, Suspense, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isEmailConfirmed } from '@/lib/email-confirmed';

const WalletApp = lazy(() => import('../ledgerly/web/WalletApp'));

type Tab = 'home' | 'tokens' | 'activity' | 'contacts' | 'settings';

const TAB_PATHS: Record<Tab, string> = {
  home: '/wallet',
  tokens: '/wallet/tokens',
  activity: '/wallet/activity',
  contacts: '/wallet/contacts',
  settings: '/wallet/settings',
};

export const Route = createFileRoute('/wallet')({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || !isEmailConfirmed(data.user)) throw redirect({ to: '/auth' });
  },
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, follow' },
      { title: 'Your wallet — Ledgerly' },
      {
        name: 'description',
        content:
          'Open your Ledgerly wallet: live balances, trust lines, send and receive XRP and issued tokens on Mainnet, Testnet and Devnet.',
      },
      { property: 'og:title', content: 'Your wallet — Ledgerly' },
      {
        property: 'og:description',
        content:
          'Balances, trust lines, send and receive on the XRP Ledger. Keys stay on your device.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: WalletLayout,
});

const GATE_PATHS = { setup: '/wallet/create', locked: '/wallet/unlock' } as const;

function WalletLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab: Tab =
    (Object.keys(TAB_PATHS) as Tab[]).find(
      (key) => key !== 'home' && pathname.startsWith(TAB_PATHS[key]),
    ) ?? 'home';

  // Setup and unlock get real URLs, so the wallet sends us to them when it is
  // not ready and back to the section routes once it is.
  const onGateChange = useCallback(
    (gate: 'setup' | 'locked' | null) => {
      const current = window.location.pathname;
      if (gate) {
        if (current !== GATE_PATHS[gate]) void navigate({ to: GATE_PATHS[gate], replace: true });
        return;
      }
      if (current === GATE_PATHS.setup || current === GATE_PATHS.locked) {
        void navigate({ to: '/wallet', replace: true });
      }
    },
    [navigate],
  );

  return (
    <ClientOnly fallback={<div className="empty">Starting Ledgerly…</div>}>
      <Suspense fallback={<div className="empty">Starting Ledgerly…</div>}>
        <WalletApp
          tab={tab}
          onTabChange={(next) => {
            void navigate({ to: TAB_PATHS[next] });
          }}
          onGateChange={onGateChange}
        >
          <Outlet />
        </WalletApp>
      </Suspense>
    </ClientOnly>
  );
}
