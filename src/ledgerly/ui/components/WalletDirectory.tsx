import { WALLET_DIRECTORY } from '@/ledgerly/ui/external/wallet-directory';

/**
 * Promotional directory of XRPL wallets. Download links only: connecting or
 * signing in with these wallets is not available yet.
 */
export function WalletDirectory() {
  return (
    <div className="stack">
      <ul className="wallet-directory" role="list">
        {WALLET_DIRECTORY.map((wallet) => {
          return (
            <li key={wallet.id} className="wallet-directory-card" data-wallet={wallet.id}>
              <div className="wallet-directory-head">
                <span className="wallet-directory-mark" data-shape={wallet.logoShape}>
                  <img src={wallet.logo} alt={`${wallet.name} logo`} loading="lazy" />
                </span>
                <div>
                  <h3 className="wallet-directory-name">{wallet.name}</h3>
                  <div className="wallet-directory-tags">
                    {wallet.platforms.map((platform) => (
                      <span key={platform} className="wallet-directory-tag">
                        {platform}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="card-note">{wallet.tagline}</p>
              <a
                className="button button--secondary button--block"
                href={wallet.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download {wallet.name}
              </a>
            </li>
          );
        })}
      </ul>
      <p className="inline-note" style={{ textAlign: 'center' }}>
        Signing in to Ledgerly with these wallets is coming soon. For now these links take you to
        each wallet's official site. Ledgerly is not affiliated with them and never sees their keys.
      </p>
    </div>
  );
}
