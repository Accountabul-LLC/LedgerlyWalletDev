const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { compile, hooks, jsx, tick, deferred } = require('./harness.cjs');
const { LatestRequest } = compile(
  path.resolve(__dirname, '../../../src/ledgerly/native/latestRequest.ts'),
);

function setup() {
  const h = hooks();
  const calls = [];
  const pending = [];
  const wallet = {
    getPortfolio(input) {
      calls.push(input);
      const request = deferred();
      pending.push(request);
      return request.promise;
    },
  };
  const { WalletHome } = compile(path.resolve(__dirname, '../src/WalletHome.tsx'), {
    react: h.react,
    'react/jsx-runtime': jsx,
    'react-native-safe-area-context': {},
    'react-native': {
      StyleSheet: { create: (v) => v },
      Platform: { OS: 'android', select: (v) => v.android },
    },
    '../../../src/ledgerly/core': { addDrops: (a, b) => (BigInt(a) + BigInt(b)).toString() },
    '../assets/ledgerly-icon.png': {},
    './brand': { BRAND: {} },
    './destinationTag': {},
    './WalletManager': {},
    './historyDate': {},
    './icons': {},
    './TokenAvatar': {},
    './MarketPanel': {},
    '../../../src/ledgerly/native/latestRequest': { LatestRequest },
  });
  const accounts = Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    address: 'public-' + i,
    label: 'Wallet ' + (i + 1),
  }));
  const render = (active = '0', network = 'testnet') =>
    h.render(() =>
      WalletHome({
        wallet,
        state: { accounts, activeAccountId: active, network: { id: network }, preferences: {} },
      }),
    );
  const dashboard = (view) => view.props.children.props.children[1].props.children[0];
  return { h, render, dashboard, calls, pending };
}
test('five balances use exact integer drops and switching reuses the same five requests', async () => {
  const f = setup();
  f.render();
  f.h.effects();
  assert.equal(f.calls.length, 5);
  f.pending.forEach((r, i) =>
    r.resolve({ account: String(i), summary: { balanceDrops: '9007199254740993' } }),
  );
  await tick();
  assert.equal(f.dashboard(f.render()).props.aggregateDrops, '45035996273704965');
  assert.equal(f.dashboard(f.render('4')).props.portfolio.account, '4');
  f.h.effects();
  assert.equal(f.calls.length, 5);
  f.h.unmount();
});
test('partial failures never present a subtotal as a complete aggregate, and retry refreshes all five', async () => {
  const f = setup();
  f.render();
  f.h.effects();
  f.pending.forEach((r, i) =>
    i === 4
      ? r.reject(new Error('synthetic network loss'))
      : r.resolve({ summary: { balanceDrops: '1' } }),
  );
  await tick();
  const first = f.dashboard(f.render());
  assert.equal(first.props.aggregateDrops, null);
  assert.match(first.props.error, /1 wallet balance/);
  first.props.onRefresh();
  assert.equal(f.calls.length, 10);
  assert.equal(
    f.calls.slice(5).every((call) => call.refresh === true),
    true,
  );
  f.pending.slice(5).forEach((r) => r.resolve({ summary: { balanceDrops: '1' } }));
  await tick();
  assert.equal(f.dashboard(f.render()).props.aggregateDrops, '5');
  f.h.unmount();
});
test('network changes discard all five stale replies', async () => {
  const f = setup();
  f.render();
  f.h.effects();
  f.render('0', 'mainnet');
  f.h.effects();
  f.pending.slice(0, 5).forEach((r) => r.resolve({ summary: { balanceDrops: '100' } }));
  await tick();
  assert.equal(f.dashboard(f.render('0', 'mainnet')).props.aggregateDrops, null);
  f.pending.slice(5).forEach((r) => r.resolve({ summary: { balanceDrops: '2' } }));
  await tick();
  assert.equal(f.dashboard(f.render('0', 'mainnet')).props.aggregateDrops, '10');
  f.h.unmount();
});
