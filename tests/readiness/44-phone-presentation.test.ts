/**
 * Pins the production phone presentation helpers before they share an
 * implementation with the website. These strings are what the phone screens
 * show; a later edit must keep every case.
 */
import { describe, expect, it } from 'vitest';
import * as web from '@/ledgerly/ui/format';
import * as phone from '../../mobile/src/format';

const network = {
  explorerTx: 'https://x.example/tx/',
  explorerAccount: 'https://x.example/a/',
};

describe('phone presentation helpers match the website', () => {
  it('relative time uses the same rounding buckets', () => {
    const now = Date.now();
    const samples = [
      null,
      now,
      now - 1_000,
      now - 59_400,
      now - 59_500,
      now - 59.4 * 60_000,
      now - 59.5 * 60_000,
      now - 23.4 * 3_600_000,
      now - 23.5 * 3_600_000,
      now - 6.4 * 86_400_000,
      now - 6.5 * 86_400_000,
      Date.UTC(2020, 0, 15, 12),
    ];
    for (const timestamp of samples) {
      expect(phone.formatRelativeTime(timestamp)).toBe(web.formatRelativeTime(timestamp));
    }
    expect(phone.formatRelativeTime(null)).toBe('Pending');
    expect(phone.formatRelativeTime(now - 59_400)).toBe('Just now');
    expect(phone.formatRelativeTime(now - 59_500)).toBe('1m ago');
    expect(phone.formatRelativeTime(now - 59.4 * 60_000)).toBe('59m ago');
    expect(phone.formatRelativeTime(now - 59.5 * 60_000)).toBe('1h ago');
    expect(phone.formatRelativeTime(now - 23.4 * 3_600_000)).toBe('23h ago');
    expect(phone.formatRelativeTime(now - 23.5 * 3_600_000)).toBe('1d ago');
    expect(phone.formatRelativeTime(now - 6.4 * 86_400_000)).toBe('6d ago');
    const older = phone.formatRelativeTime(Date.UTC(2020, 0, 15, 12));
    expect(older).toBe(
      new Date(Date.UTC(2020, 0, 15, 12)).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
    );
    expect(older).not.toContain('ago');
  });

  it('durations ceil into the same plain-language units', () => {
    for (const ms of [0, 1, 1_000, 59_000, 59_001, 60_000, 59 * 60_000, 59 * 60_000 + 1]) {
      expect(phone.formatDuration(ms)).toBe(web.formatDuration(ms));
    }
    expect(phone.formatDuration(0)).toBe('0 seconds');
    expect(phone.formatDuration(1)).toBe('1 seconds');
    expect(phone.formatDuration(59_000)).toBe('59 seconds');
    expect(phone.formatDuration(59_001)).toBe('1 minutes');
    expect(phone.formatDuration(59 * 60_000)).toBe('59 minutes');
    expect(phone.formatDuration(59 * 60_000 + 1)).toBe('1 hours');
  });

  it('initials, tickers, and badges keep their current spelling', () => {
    expect(phone.initialsOf('alpha beta gamma')).toBe('AB');
    expect(phone.initialsOf('solo')).toBe('S');
    expect(phone.initialsOf('')).toBe('A');
    expect(phone.initialsOf('  ')).toBe('A');
    expect(phone.assetTicker('  XRP  ')).toBe('$XRP');
    expect(phone.assetTicker('xrp')).toBe('$xrp');
    expect(phone.assetTicker('$')).toBe('$');
    expect(phone.tokenBadgeLabel('abcdef')).toBe('ABC');
    expect(phone.tokenBadgeLabel('  ab ')).toBe('AB');
    expect(phone.tokenBadgeLabel('')).toBe('?');
    for (const code of ['XRP', '$RLUSD', '', '  XRP  ', 'abcdef']) {
      expect(phone.assetTicker(code)).toBe(web.assetTicker(code));
      expect(phone.tokenBadgeLabel(code)).toBe(web.tokenBadgeLabel(code));
      expect(phone.initialsOf(code)).toBe(web.initialsOf(code));
    }
  });

  it('explorer links ignore the unused field and stay null when blank', () => {
    expect(phone.explorerTxUrl(network, 'HASH')).toBe('https://x.example/tx/HASH');
    expect(phone.explorerAccountUrl(network, 'rAddr')).toBe('https://x.example/a/rAddr');
    expect(
      phone.explorerTxUrl({ explorerTx: '', explorerAccount: network.explorerAccount }, 'HASH'),
    ).toBeNull();
    expect(
      phone.explorerAccountUrl({ explorerTx: network.explorerTx, explorerAccount: '' }, 'rAddr'),
    ).toBeNull();
    expect(phone.explorerTxUrl(network, 'HASH')).toBe(web.explorerTxUrl(network, 'HASH'));
    expect(phone.explorerAccountUrl(network, 'rAddr')).toBe(
      web.explorerAccountUrl(network, 'rAddr'),
    );
    const txOnly = { explorerTx: network.explorerTx };
    const accountOnly = { explorerAccount: network.explorerAccount };
    expect(phone.explorerTxUrl(txOnly, 'HASH')).toBe('https://x.example/tx/HASH');
    expect(phone.explorerAccountUrl(accountOnly, 'rAddr')).toBe('https://x.example/a/rAddr');
    expect(phone.explorerTxUrl(txOnly, 'HASH')).toBe(web.explorerTxUrl(txOnly, 'HASH'));
    expect(phone.explorerAccountUrl(accountOnly, 'rAddr')).toBe(
      web.explorerAccountUrl(accountOnly, 'rAddr'),
    );
  });
});
