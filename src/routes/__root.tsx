import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { privateAnalyticsEvent } from '@/lib/analytics-privacy';

import appCss from '../styles.css?url';
import { supabase } from '@/integrations/supabase/client';
import { guardHistoryRestore } from '@/lib/history-session';

const fallbackTheme = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: '24px',
    background: '#f5f5ef',
    color: '#171a18',
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    width: 'min(420px, 100%)',
    padding: '28px 24px 24px',
    borderRadius: '26px',
    border: '1px solid #e6e8e2',
    background: '#fff',
    boxShadow: '0 18px 40px rgba(16, 18, 16, 0.07)',
    textAlign: 'center' as const,
  },
  mark: {
    display: 'grid',
    placeItems: 'center',
    width: '34px',
    height: '34px',
    margin: '0 auto 16px',
    borderRadius: '12px',
    background: '#171a18',
    color: '#dff532',
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontStyle: 'italic' as const,
    fontSize: '16px',
  },
  title: {
    margin: 0,
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: '24px',
    fontWeight: 400,
    letterSpacing: '-0.01em',
  },
  copy: {
    margin: '10px 0 0',
    fontSize: '13px',
    lineHeight: 1.55,
    color: '#737973',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
    marginTop: '20px',
  },
  primary: {
    padding: '11px 18px',
    borderRadius: '99px',
    border: '1px solid #171a18',
    background: '#171a18',
    color: '#dff532',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  secondary: {
    padding: '11px 18px',
    borderRadius: '99px',
    border: '1px solid #e6e8e2',
    background: '#fff',
    color: '#171a18',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textDecoration: 'none',
  },
};

function FallbackShell({ children }: { children: ReactNode }) {
  return (
    <div style={fallbackTheme.page}>
      <div style={fallbackTheme.card}>
        <div style={fallbackTheme.mark} aria-hidden="true">
          L
        </div>
        {children}
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <FallbackShell>
      <h1 style={fallbackTheme.title}>We couldn't find that page</h1>
      <p style={fallbackTheme.copy}>
        This page may have moved or never existed. Your wallet is untouched and still safe on this
        device.
      </p>
      <div style={fallbackTheme.actions}>
        <Link to="/" style={fallbackTheme.primary}>
          Back to wallet
        </Link>
      </div>
    </FallbackShell>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    // Keep client errors local; never forward wallet-screen contents to telemetry.
    console.error('Ledgerly interface error');
  }, [error]);

  return (
    <FallbackShell>
      <h1 style={fallbackTheme.title}>Something didn't load</h1>
      <p style={fallbackTheme.copy}>
        The wallet interface hit a snag. Nothing happened to your keys, they stay encrypted on this
        device. Try loading again.
      </p>
      <div style={fallbackTheme.actions}>
        <button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
          style={fallbackTheme.primary}
        >
          Try again
        </button>
        <a href="/" style={fallbackTheme.secondary}>
          Back to wallet
        </a>
      </div>
    </FallbackShell>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        name: 'google-site-verification',
        content: 'vCG9STIOtpbLToEotXR884Hvvbha_xtRBH3gx7yIHDg',
      },
      { title: 'Ledgerly — Non-custodial XRP Ledger Wallet' },
      {
        name: 'description',
        content:
          'Ledgerly is a self-custodial XRP Ledger wallet in your browser. Keys are generated and encrypted on your device and never reach our servers.',
      },
      { name: 'author', content: 'Ledgerly' },
      { name: 'theme-color', content: '#f5f5ef' },
      { property: 'og:site_name', content: 'Ledgerly' },
      { property: 'og:title', content: 'Ledgerly — Non-custodial XRP Ledger Wallet' },
      {
        property: 'og:description',
        content:
          'A self-custodial XRP Ledger wallet in your browser. Send and receive XRP and issued tokens with keys that stay on your device.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: 'https://ledgerlywallet.com/og-image.png' },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'Ledgerly' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: 'https://ledgerlywallet.com/og-image.png' },
      { name: 'twitter:image:alt', content: 'Ledgerly' },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      { rel: 'icon', href: '/ledgerly-favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.png', type: 'image/png', sizes: '32x32' },
      { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <Analytics beforeSend={privateAnalyticsEvent} />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const stopHistoryGuard = guardHistoryRestore();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'USER_UPDATED') return;
      if (event === 'SIGNED_OUT') queryClient.clear();
      clearTimeout(timer);
      // Do not re-enter Supabase from route guards while its callback lock is held.
      timer = setTimeout(() => {
        void router.invalidate();
        if (event !== 'SIGNED_OUT') void queryClient.invalidateQueries();
      }, 0);
    });
    return () => {
      clearTimeout(timer);
      stopHistoryGuard();
      data.subscription.unsubscribe();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
