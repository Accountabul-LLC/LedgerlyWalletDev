/** Presentation helpers. Nothing here participates in arithmetic on balances. */

export function formatRelativeTime(timestamp: number | null): string {
  if (timestamp === null) return 'Pending';
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  return `${Math.ceil(minutes / 60)} hours`;
}

export function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? '').join('') || 'A';
}

/**
 * Ticker label for an asset. Every asset on the ledger is a token, so they all
 * read the same way: a dollar sign in front of the code.
 */
export function assetTicker(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length === 0) return '$';
  return trimmed.startsWith('$') ? trimmed : `$${trimmed}`;
}

/** Three letter label for the round badge next to a token row. */
export function tokenBadgeLabel(code: string): string {
  const trimmed = code.trim();
  return (trimmed === '' ? '?' : trimmed).slice(0, 3).toUpperCase();
}

interface ExplorerNetwork {
  readonly explorerTx: string;
  readonly explorerAccount: string;
}

/** Explorer link for a transaction, or null when the network has no explorer. */
export function explorerTxUrl(network: ExplorerNetwork, hash: string): string | null {
  return network.explorerTx ? `${network.explorerTx}${hash}` : null;
}

/** Explorer link for an account, or null when the network has no explorer. */
export function explorerAccountUrl(network: ExplorerNetwork, address: string): string | null {
  return network.explorerAccount ? `${network.explorerAccount}${address}` : null;
}
