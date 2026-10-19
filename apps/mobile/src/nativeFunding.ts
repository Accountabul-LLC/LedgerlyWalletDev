import type { WalletEngine } from '../../../src/ledgerly/core';

/** A faucet HTTP acceptance can precede its validated ledger funding. Never submit twice. */
export async function fundAndWait(
  engine: Pick<WalletEngine, 'getState' | 'getPortfolio' | 'fundTestAccount'>,
  accountId: string,
  wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1000)),
): Promise<void> {
  const initial = await engine.getState();
  if (!initial.network.isTest || !initial.network.faucet)
    throw new Error('Funding is only available on test networks.');
  if (initial.status !== 'unlocked')
    throw new Error('Unlock the wallet before requesting funding.');
  const before = await engine.getPortfolio({ accountId, refresh: true });
  const current = await engine.getState();
  if (current.status !== 'unlocked' || current.network.id !== initial.network.id)
    throw new Error('The wallet or network changed. Review it before requesting funding.');
  await engine.fundTestAccount({ accountId });
  for (let attempt = 0; attempt < 20; attempt++) {
    await wait();
    const state = await engine.getState();
    if (state.status !== 'unlocked' || state.network.id !== initial.network.id)
      throw new Error(
        'Funding was requested. Unlock the wallet on its original network to refresh.',
      );
    const after = await engine.getPortfolio({ accountId, refresh: true });
    if (
      after.summary.exists &&
      BigInt(after.summary.balanceDrops) > BigInt(before.summary.balanceDrops)
    )
      return;
  }
  throw new Error(
    'The faucet accepted the request. Its balance is still pending; refresh shortly.',
  );
}
