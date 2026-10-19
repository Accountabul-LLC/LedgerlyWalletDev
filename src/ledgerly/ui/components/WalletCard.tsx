import type { ReactNode } from 'react';

/**
 * The single card template used everywhere a wallet balance is shown: the
 * combined "All wallets" summary, each wallet in the unified grid, and the
 * focused single wallet view. Keeping one component means the three places
 * cannot drift apart in layout, spacing or type scale.
 */
export function WalletCard({
  title,
  badge,
  address,
  subtitle,
  headActions,
  networkLabel,
  isTest,
  balance,
  unit = 'XRP',
  state,
  note,
  children,
  actions,
  links,
  skin = 'plain',
  variant,
}: {
  title: string;
  /** Small tag beside the name, such as the outside wallet a card belongs to. */
  badge?: ReactNode;
  /** Full account address, shown on its own line under the wallet name. */
  address?: ReactNode;
  /** Short explanation for cards without an address, such as the total. */
  subtitle?: ReactNode;
  /** Copy, hide and rename controls, rendered inline beside the address. */
  headActions?: ReactNode;
  networkLabel: string;
  isTest: boolean;
  balance: ReactNode;
  unit?: string;
  state?: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  links?: ReactNode;
  /** Plain is the light paper surface; feature is the dark lead card. */
  skin?: 'plain' | 'feature';
  variant?: 'total';
}) {
  const skinClass = skin === 'feature' ? 'card--feature' : 'card--plain';
  return (
    <section
      className={`card ${skinClass} wallet-card${variant === 'total' ? ' wallet-card--total' : ''}`}
    >
      <div className="wallet-card-top">
        <div className="wallet-card-head">
          <div className="wallet-card-title-row">
            <strong>{title}</strong>
            {badge ? <span className="wallet-badge">{badge}</span> : null}
            <span className={`balance-chip ${isTest ? 'balance-chip--test' : ''}`}>
              {networkLabel}
              <span className="balance-chip-note">
                {isTest ? 'Practice funds, not real money' : 'Live network, real funds'}
              </span>
            </span>
          </div>

          <div className="wallet-card-address-row">
            {address ? (
              <span className="wallet-card-address mono">{address}</span>
            ) : subtitle ? (
              <span className="wallet-card-sub">{subtitle}</span>
            ) : null}
            {headActions ? <span className="wallet-card-head-actions">{headActions}</span> : null}
          </div>
        </div>

        <div className="wallet-card-balance">
          <strong>{balance}</strong>
          <span>{unit}</span>
          {state ? <span className="wallet-card-state">{state}</span> : null}
        </div>

        <p className="card-note wallet-card-note">{note ?? '\u00a0'}</p>

        {children ? <div className="wallet-card-assets">{children}</div> : null}
      </div>

      <div className="wallet-card-foot">
        {actions ? <div className="card-actions">{actions}</div> : null}
        {links ? <div className="wallet-card-links">{links}</div> : null}
      </div>
    </section>
  );
}
