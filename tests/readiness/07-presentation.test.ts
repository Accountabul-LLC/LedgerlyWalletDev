import { describe, expect, it } from 'vitest';
import {
  assetTicker,
  explorerAccountUrl,
  explorerTxUrl,
  formatDuration,
  formatRelativeTime,
  initialsOf,
  tokenBadgeLabel,
} from '@/ledgerly/ui/format';

describe('readiness: presentation helpers', () => {
  it('T55 relative time covers every bucket', () => {
    const now = Date.now();
    expect(formatRelativeTime(null)).toBe('Pending');
    expect(formatRelativeTime(now)).toBe('Just now');
    expect(formatRelativeTime(now - 5 * 60_000)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 3_600_000)).toBe('3h ago');
    expect(formatRelativeTime(now - 3 * 86_400_000)).toBe('3d ago');
    expect(formatRelativeTime(now - 60 * 86_400_000)).not.toContain('ago');
  });

  it('T56 durations read in plain language', () => {
    expect(formatDuration(1_000)).toBe('1 seconds');
    expect(formatDuration(90_000)).toBe('2 minutes');
    expect(formatDuration(3 * 3_600_000)).toBe('3 hours');
  });

  it('T57 initials and badges handle empty or odd labels', () => {
    expect(initialsOf('Main Wallet')).toBe('MW');
    expect(initialsOf('  ')).toBe('A');
    expect(tokenBadgeLabel('')).toBe('?');
    expect(tokenBadgeLabel('solo')).toBe('SOL');
  });

  it('T58 every ledger asset renders with a single ticker prefix', () => {
    expect(assetTicker('XRP')).toBe('$XRP');
    expect(assetTicker('$RLUSD')).toBe('$RLUSD');
    expect(assetTicker('')).toBe('$');
  });

  it('T59 explorer links are null when the network has none', () => {
    const withExplorer = {
      explorerTx: 'https://x.example/tx/',
      explorerAccount: 'https://x.example/a/',
    };
    const without = { explorerTx: '', explorerAccount: '' };
    expect(explorerTxUrl(withExplorer, 'HASH')).toBe('https://x.example/tx/HASH');
    expect(explorerAccountUrl(withExplorer, 'rAddr')).toBe('https://x.example/a/rAddr');
    expect(explorerTxUrl(without, 'HASH')).toBeNull();
    expect(explorerAccountUrl(without, 'rAddr')).toBeNull();
  });
});
