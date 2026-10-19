import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { isEmailConfirmed } from '@/lib/email-confirmed';
import { ProfileBalances } from '@/ledgerly/ui/views/ProfileBalances';
import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/balances')({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || !isEmailConfirmed(data.user)) throw redirect({ to: '/auth' });
  },
  head: () => ({
    meta: [
      { title: 'Your balances — Ledgerly' },
      {
        name: 'description',
        content:
          'See the live balances of every Ledgerly wallet saved to your profile, from any browser or phone. Look only: sending needs your keys on that device.',
      },
      { property: 'og:title', content: 'Your balances — Ledgerly' },
      {
        property: 'og:description',
        content: 'Live XRP Ledger balances for every wallet on your profile, read only.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ProfileBalances,
});
