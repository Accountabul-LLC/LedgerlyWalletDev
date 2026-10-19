import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { dropsToXrp, isValidAddress } from '../../src/ledgerly/core/shared';
import { parseDestinationTag } from '../../src/ledgerly/native/destinationTag';
const require = createRequire(import.meta.url);
const { compile, hooks, jsx, tick, deferred } = require('../../apps/mobile/test/harness.cjs');
const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
type Node = {
  type?: unknown;
  props?: Record<string, unknown> & { onPress: () => void; onChangeText: (value: string) => void };
};
function find(node: Node | undefined, predicate: (node: Node) => boolean): Node | undefined {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child as Node, predicate);
    if (result) return result;
  }
}
const control = (tree: Node, label: string) => find(tree, (node) => node.props?.label === label)!;
const ui = Object.fromEntries(
  ['Button', 'Callout', 'Card', 'Field', 'Note', 'Screen', 'Title'].map((key) => [key, key]),
);
const token = {
  currency: 'USD',
  issuer: address,
  display: 'USD',
  balance: '5',
  frozen: false,
  isObligation: false,
};
const portfolio = (tokens: unknown[] = []) => ({ tokens, summary: { spendableDrops: '99000000' } });
const prepared = {
  requestId: 'request-a',
  description: { headline: 'Review', summary: '', fields: [], findings: [] },
};
function setup(getPortfolio: () => Promise<unknown>, preparePayment = vi.fn(async () => prepared)) {
  const h = hooks();
  const state = {
    accounts: [
      { id: 'a', address, label: 'Wallet A' },
      { id: 'b', address, label: 'Wallet B' },
    ],
    activeAccountId: 'a',
    network: {
      id: 'test',
      endpoint: 'wss://test.example',
      networkId: 1,
      label: 'Testnet',
      isTest: true,
    },
  };
  const wallet = {
    listContacts: async () => [],
    getPortfolio,
    preparePayment,
    discardPrepared: vi.fn(async () => {}),
    confirmPrepared: vi.fn(async () => ({ succeeded: true, hash: 'hash', message: 'sent' })),
  };
  const { default: Send } = compile(resolve('mobile/src/app/send.tsx'), {
    react: h.react,
    'react/jsx-runtime': jsx,
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' },
    'expo-router': { useRouter: () => ({ back() {}, push() {}, replace() {} }) },
    '@ledgerly/core/shared': {
      dropsToXrp,
      isValidAddress,
      formatAmount: String,
      shortenAddress: String,
    },
    '../wallet': { useWallet: () => ({ wallet, state, openExternal() {} }) },
    '../ui': ui,
    '../format': { assetTicker: String, ledgerAssetLabel: String, explorerTxUrl: () => null },
    '../scan-result': { takeScan: () => null },
    '../theme': { colors: {}, XRPL_DOCS: '' },
    '../../../src/ledgerly/native/destinationTag': { parseDestinationTag },
    '../activity': { recordSignedPayment() {} },
  });
  const render = () => h.render(Send);
  const fill = () => {
    control(render(), 'Recipient').props!.onChangeText(address);
    control(render(), 'Amount').props!.onChangeText('1');
  };
  return { h, state, wallet, render, fill };
}
test('late portfolio from an earlier account cannot enable send or replace current asset balances', async () => {
  const a = deferred(),
    b = deferred();
  let reads = 0;
  const env = setup(() => (++reads === 1 ? a.promise : b.promise));
  env.render();
  env.h.effects();
  const source = find(env.render(), (node) => String(node.props?.label).startsWith('Wallet B'))!;
  source.props!.onPress();
  env.render();
  env.h.effects();
  env.fill();
  a.resolve(portfolio([token]));
  await tick();
  expect(control(env.render(), 'Review transaction').props!.disabled).toBe(true);
  expect(find(env.render(), (node) => String(node.props?.label).includes('USD'))).toBeUndefined();
  b.resolve(portfolio([]));
  await tick();
  expect(control(env.render(), 'Review transaction').props!.disabled).toBe(false);
});
test('removed or frozen selected token never falls back to an XRP payment after a network change', async () => {
  for (const tokens of [[], [{ ...token, frozen: true }]]) {
    const pending = deferred();
    let reads = 0;
    const env = setup(async () => (++reads === 1 ? portfolio([token]) : pending.promise));
    env.render();
    env.h.effects();
    await tick();
    env.fill();
    find(env.render(), (node) => String(node.props?.label).includes('USD'))!.props!.onPress();
    env.state.network = {
      ...env.state.network,
      id: 'other',
      endpoint: 'wss://other.example',
      networkId: 2,
    };
    let tree = env.render();
    expect(control(tree, 'Review transaction').props!.disabled).toBe(true);
    env.h.effects();
    pending.resolve(portfolio(tokens));
    await tick();
    tree = env.render();
    expect(control(tree, 'Review transaction').props!.disabled).toBe(true);
    control(tree, 'Review transaction').props!.onPress();
    await tick();
    expect(env.wallet.preparePayment).not.toHaveBeenCalled();
  }
});
test('editing fields while prepare is in flight discards its late request without showing stale review', async () => {
  const pending = deferred();
  const env = setup(
    async () => portfolio(),
    vi.fn(() => pending.promise),
  );
  env.render();
  env.h.effects();
  await tick();
  env.fill();
  control(env.render(), 'Review transaction').props!.onPress();
  control(env.render(), 'Amount').props!.onChangeText('2');
  env.render();
  pending.resolve(prepared);
  await tick();
  expect(env.wallet.discardPrepared).toHaveBeenCalledWith({ requestId: 'request-a' });
  expect(control(env.render(), 'Review transaction')).toBeDefined();
  expect(control(env.render(), 'Confirm and send')).toBeUndefined();
});
test('network changes or unmount while preparing discard pending approvals', async () => {
  for (const unmount of [false, true]) {
    const pending = deferred();
    const env = setup(
      async () => portfolio(),
      vi.fn(() => pending.promise),
    );
    env.render();
    env.h.effects();
    await tick();
    env.fill();
    control(env.render(), 'Review transaction').props!.onPress();
    if (unmount) env.h.unmount();
    else {
      env.state.network = { ...env.state.network, endpoint: 'wss://changed.example' };
      env.render();
    }
    pending.resolve(prepared);
    await tick();
    expect(env.wallet.discardPrepared).toHaveBeenCalledWith({ requestId: 'request-a' });
  }
});
test('a network change immediately hides prepared review and refuses old confirmation handlers', async () => {
  const env = setup(async () => portfolio());
  env.render();
  env.h.effects();
  await tick();
  env.fill();
  control(env.render(), 'Review transaction').props!.onPress();
  await tick();
  control(env.render(), 'Confirm and send').props!.onPress();
  const oldConfirm = control(env.render(), 'Yes, send it');
  env.state.network = { ...env.state.network, id: 'mainnet', networkId: 0, isTest: false };
  const tree = env.render();
  expect(control(tree, 'Review transaction')).toBeDefined();
  expect(control(tree, 'Yes, send real funds')).toBeUndefined();
  oldConfirm.props!.onPress();
  await tick();
  expect(env.wallet.confirmPrepared).not.toHaveBeenCalled();
  env.h.effects();
  expect(env.wallet.discardPrepared).toHaveBeenCalledWith({ requestId: 'request-a' });
});

test('rapid duplicate review and confirmation presses start each wallet operation once', async () => {
  const pending = deferred();
  const env = setup(
    async () => portfolio(),
    vi.fn(() => pending.promise),
  );
  env.render();
  env.h.effects();
  await tick();
  env.fill();
  const review = control(env.render(), 'Review transaction');
  review.props!.onPress();
  review.props!.onPress();
  expect(env.wallet.preparePayment).toHaveBeenCalledTimes(1);
  pending.resolve(prepared);
  await tick();
  control(env.render(), 'Confirm and send').props!.onPress();
  const confirm = control(env.render(), 'Yes, send it');
  confirm.props!.onPress();
  confirm.props!.onPress();
  expect(env.wallet.confirmPrepared).toHaveBeenCalledTimes(1);
});
