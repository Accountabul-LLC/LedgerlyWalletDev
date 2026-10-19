import type { Portfolio, WalletApi } from '@ledgerly/core/shared';

/** Submit once, then observe validated balances on the original network. */
export async function fundAndWait(
  wallet: Pick<WalletApi, 'getState' | 'getPortfolio' | 'fundTestAccount'>,
  accountId: string,
  wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1000)),
): Promise<void> {
  const initial = await wallet.getState();
  if (!initial.network.isTest || !initial.network.faucet) {
    throw new Error('Funding is only available on test networks.');
  }
  if (initial.status !== 'unlocked') {
    throw new Error('Unlock the wallet before requesting funding.');
  }
  const networkId = initial.network.id;
  const before = await wallet.getPortfolio({ accountId, refresh: true });
  const ready = await wallet.getState();
  if (ready.status !== 'unlocked' || ready.network.id !== networkId) {
    throw new Error('The wallet or network changed. Review it before requesting funding.');
  }
  await wallet.fundTestAccount({ accountId });
  const deadline = Date.now() + 60_000;
  for (let attempt = 0; attempt < 20 && Date.now() < deadline; attempt += 1) {
    await wait();
    const state = await wallet.getState();
    if (state.status !== 'unlocked' || state.network.id !== networkId) {
      throw new Error(
        'Funding was requested. Unlock the wallet on its original network to refresh.',
      );
    }
    let next: Portfolio;
    try {
      next = await wallet.getPortfolio({ accountId, refresh: true });
    } catch {
      // A temporary ledger read failure must not cause a second faucet POST.
      continue;
    }
    const current = await wallet.getState();
    if (current.status !== 'unlocked' || current.network.id !== networkId) {
      throw new Error(
        'Funding was requested. Unlock the wallet on its original network to refresh.',
      );
    }
    if (
      next.summary.exists &&
      BigInt(next.summary.balanceDrops) > BigInt(before.summary.balanceDrops)
    )
      return;
  }
  throw new Error(
    'The faucet accepted the request. Its balance is still pending; refresh shortly before requesting again.',
  );
}
