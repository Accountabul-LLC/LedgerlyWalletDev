import type { ComponentProps, SVGProps } from 'react';
import joeyLogo from '@/assets/wallets/joey.png';

/**
 * Inline SVG rather than an icon font or sprite sheet: an extension's content
 * security policy forbids remote assets, and inlining keeps the popup free of
 * any network request at render time.
 */
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const WalletIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
    <path d="M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5" />
    <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
);

export const CoinsIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <ellipse cx="9" cy="6.5" rx="6" ry="2.8" />
    <path d="M3 6.5v4c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8v-4" />
    <path d="M9 17.5c-3.3 0-6-1.3-6-2.8" />
    <ellipse cx="15" cy="17.5" rx="6" ry="2.8" />
    <path d="M9 13.3v1.4" />
  </Icon>
);

export const ActivityIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M7 7v10" />
    <path d="m4 14 3 3 3-3" />
    <path d="M17 17V7" />
    <path d="m14 10 3-3 3 3" />
  </Icon>
);

export const SettingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Icon>
);

export const SendIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </Icon>
);

export const ReceiveIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </Icon>
);

export const CopyIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </Icon>
);

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="m4 12.5 5 5 11-11" />
  </Icon>
);

export const LockIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const ShieldIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 3 5 6v6c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9V6Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const AlertIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 4 2.5 20h19Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
);

export const InfoIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
);

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

export const EyeIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M4 4l16 16" />
    <path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4.1" />
    <path d="M6.6 7.9A16.9 16.9 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.3-.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
);

export const UsersIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3.2 3.2 0 0 1 0 6.2" />
    <path d="M17.5 14.4A6 6 0 0 1 21 20" />
  </Icon>
);

export const RefreshIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M20 11a8 8 0 0 0-14-4.5L4 9" />
    <path d="M4 5v4h4" />
    <path d="M4 13a8 8 0 0 0 14 4.5L20 15" />
    <path d="M20 19v-4h-4" />
  </Icon>
);

export const TrashIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M4 7h16" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
    <path d="M6 7v12.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7" />
  </Icon>
);

export const ExternalIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
  </Icon>
);

export const PencilIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="M13.5 6.5 17.5 10.5" />
  </Icon>
);

/**
 * Official Google "G" mark. Brand colours are fixed, so this one does not use
 * currentColor like the rest of the set.
 */
export const GoogleMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="google-mark" {...props}>
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.28-3.15.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19Z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.9l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
    />
  </svg>
);

/**
 * Joey Wallet's own app icon, so the outside wallet is instantly recognisable
 * in buttons, badges and wallet rows.
 */
export const JoeyMark = (props: ComponentProps<'img'>) => (
  <img src={joeyLogo} alt="" aria-hidden="true" className="joey-mark" {...props} />
);

export const ScanIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M3 8V5a2 2 0 0 1 2-2h3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    <path d="M3 12h18" />
  </Icon>
);

/**
 * GitHub Octocat mark. Brand colours are fixed, so this one does not use
 * currentColor like the rest of the set.
 */
export const GitHubMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 98 96" aria-hidden="true" {...props}>
    <path
      fill="#24292f"
      fillRule="evenodd"
      d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.237-5.404-22.237-24.434 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 19.034-11.404 23.293-22.324 24.434 1.76 1.52 3.36 4.497 3.36 9.074 0 6.569-.08 11.849-.08 13.489 0 1.32.89 2.852 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
    />
  </svg>
);
