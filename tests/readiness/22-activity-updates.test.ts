import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_CHANNEL, ACTIVITY_UPDATED } from '@/lib/activity-updates';

const realtime = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn(), send: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return { channel, create: vi.fn(() => channel), remove: vi.fn().mockResolvedValue('ok') };
});
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: realtime.create, removeChannel: realtime.remove },
}));
vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: { channel: realtime.create, removeChannel: realtime.remove },
}));
vi.mock('@/lib/metrics.functions', () => ({
  recordWalletEvent: vi.fn(),
  recordSignedPaymentValue: vi.fn(),
}));

import { subscribePlatformStats } from '@/ledgerly/ui/metrics';
import { notifyActivityUpdated } from '@/lib/activity-updates.server';

afterEach(() => vi.clearAllMocks());

describe('activity event updates', () => {
  it('refreshes for recorded events and reconnects, and releases the subscription', () => {
    const refresh = vi.fn();
    const unsubscribe = subscribePlatformStats(refresh);
    expect(realtime.create).toHaveBeenCalledWith(ACTIVITY_CHANNEL);
    expect(realtime.channel.on).toHaveBeenCalledWith(
      'broadcast',
      { event: ACTIVITY_UPDATED },
      refresh,
    );
    const onEvent = realtime.channel.on.mock.calls[0][2];
    const onStatus = realtime.channel.subscribe.mock.calls[0][0];
    onStatus('CHANNEL_ERROR');
    expect(refresh).not.toHaveBeenCalled();
    onStatus('SUBSCRIBED');
    onEvent();
    onStatus('SUBSCRIBED');
    expect(refresh).toHaveBeenCalledTimes(3);
    unsubscribe();
    expect(realtime.remove).toHaveBeenCalledWith(realtime.channel);
  });

  it('broadcasts an invalidation without public wallet metadata', async () => {
    realtime.channel.send.mockResolvedValueOnce('ok');
    await notifyActivityUpdated();
    expect(realtime.channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: ACTIVITY_UPDATED,
      payload: {},
    });
    expect(realtime.remove).toHaveBeenCalledWith(realtime.channel);
  });

  it('does not fail a recorded wallet action when notifications or cleanup fail', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    realtime.channel.send.mockRejectedValueOnce(new Error('Offline'));
    realtime.remove.mockRejectedValueOnce(new Error('Offline'));
    await expect(notifyActivityUpdated()).resolves.toBeUndefined();
    expect(realtime.remove).toHaveBeenCalledWith(realtime.channel);
    warning.mockRestore();
  });
});
