import joeyLogo from '@/assets/wallets/joey.png';
import xamanLogo from '@/assets/wallets/xaman.svg';

export type WalletPlatform = 'Mobile' | 'Extension' | 'Hardware';

export interface ExternalWallet {
  /** Stable key, also used for test hooks. */
  id: string;
  name: string;
  tagline: string;
  /** Official site. Hardcoded https URL, never built from user input. */
  url: string;
  platforms: WalletPlatform[];
  /** Each vendor's own logo, bundled locally so no request leaves the page. */
  logo: string;
  /** Wordmarks read wide, square app icons read small. */
  logoShape: 'wordmark' | 'icon';
}

/**
 * XRPL wallets we point people to. These are download links only: signing in to
 * Ledgerly with them is not available yet.
 */
export const WALLET_DIRECTORY: ExternalWallet[] = [
  {
    id: 'joey',
    name: 'Joey Wallet',
    tagline: 'Self custodial XRPL wallet with a friendly mobile app and browser signing.',
    url: 'https://joeywallet.xyz',
    platforms: ['Mobile', 'Extension'],
    logo: joeyLogo,
    logoShape: 'icon',
  },
  {
    id: 'xaman',
    name: 'Xaman',
    tagline: 'The long running XRPL mobile wallet, formerly known as XUMM.',
    url: 'https://xaman.app',
    platforms: ['Mobile'],
    logo: xamanLogo,
    logoShape: 'wordmark',
  },
];
