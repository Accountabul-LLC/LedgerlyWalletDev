/**
 * Extension shims for web-app-only modules.
 *
 * The interface is shared with the web app, which uses TanStack Start server
 * functions and a router. Neither exists inside an extension page, so these
 * stand-ins keep the shared components compiling and degrade the two features
 * that genuinely need the website.
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { createElement } from 'react';

const SITE = 'https://ledgerlywallet.com';

/** Server functions live on the website; the popup opens it instead. */
export function useServerFn(): (...args: unknown[]) => Promise<never> {
  return async () => {
    throw new Error('The token directory is available in the Ledgerly web app.');
  };
}

/** Router links become plain links back to the website. */
export function Link({
  to,
  children,
  ...rest
}: { to?: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return createElement(
    'a',
    { ...rest, href: to ? `${SITE}${to}` : SITE, target: '_blank', rel: 'noopener noreferrer' },
    children,
  );
}

export function useNavigate() {
  return () => undefined;
}

export function useRouter() {
  return { navigate: () => undefined };
}
