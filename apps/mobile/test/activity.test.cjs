const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path');
const { compile, hooks, jsx, tick, deferred } = require('./harness.cjs');
const { LatestRequest } = compile(
  path.resolve(__dirname, '../../../src/ledgerly/native/latestRequest.ts'),
);
function setup() {
  const h = hooks(),
    pending = [];
  const wallet = {
    getHistory(input) {
      const request = deferred();
      pending.push({ input, ...request });
      return request.promise;
    },
  };
  const { formatHistoryDate } = compile(path.resolve(__dirname, '../src/historyDate.ts'));
  const { Activity } = compile(path.resolve(__dirname, '../src/WalletHome.tsx'), {
    react: h.react,
    'react/jsx-runtime': jsx,
    'react-native-safe-area-context': {},
    'react-native': {
      StyleSheet: { create: (v) => v },
      Platform: { select: (v) => v.android },
      FlatList: 'FlatList',
    },
    '../../../src/ledgerly/core': {},
    '../assets/ledgerly-icon.png': {},
    './brand': { BRAND: {} },
    './destinationTag': {},
    './WalletManager': {},
    './historyDate': { formatHistoryDate },
    './icons': {},
    './TokenAvatar': {},
    './MarketPanel': {},
    '../../../src/ledgerly/native/latestRequest': { LatestRequest },
  });
  const render = (id = 'A', network = 'testnet') =>
    h.render(() =>
      Activity({ wallet, state: { network: { id: network, label: network } }, accountId: id }),
    );
  return { h, pending, render, formatHistoryDate };
}
test('cached date formatting preserves calendar output and ignores malformed timestamps', () => {
  const f = setup(),
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }),
    timestamp = 1700000000000;
  assert.equal(
    f.formatHistoryDate(timestamp, formatter),
    ' · ' + new Date(timestamp).toLocaleDateString('en-US', { timeZone: 'UTC' }),
  );
  assert.equal(f.formatHistoryDate(null, formatter), '');
  assert.equal(f.formatHistoryDate(NaN, formatter), '');
  assert.equal(f.formatHistoryDate(Infinity, formatter), '');
  assert.equal(f.formatHistoryDate(0, formatter), ' · 1/1/1970');
});
test('large histories remain list data and continuation appends only the requested page', async () => {
  const f = setup();
  f.render();
  f.h.effects();
  const entries = Array.from({ length: 1000 }, (_, i) => ({ hash: 'synthetic-' + i }));
  f.pending[0].resolve({ entries, marker: 'page-two' });
  await tick();
  let list = f.render();
  assert.equal(list.type, 'FlatList');
  assert.equal(list.props.data.length, 1000);
  list.props.ListFooterComponent.props.onPress();
  assert.equal(f.pending[1].input.marker, 'page-two');
  f.pending[1].resolve({ entries: [{ hash: 'page-two-entry' }], marker: undefined });
  await tick();
  list = f.render();
  assert.equal(list.props.data.length, 1001);
  assert.equal(list.props.data[1000].hash, 'page-two-entry');
  assert.equal(list.props.ListFooterComponent, null);
  f.h.unmount();
});
test('wallet and network switches never append an old history response', async () => {
  const f = setup();
  f.render();
  f.h.effects();
  f.render('B', 'mainnet');
  f.h.effects();
  f.pending[1].resolve({ entries: [{ hash: 'correct-network' }], marker: undefined });
  await tick();
  f.pending[0].resolve({ entries: [{ hash: 'stale-private-history' }], marker: 'stale-marker' });
  await tick();
  const list = f.render('B', 'mainnet');
  assert.equal(list.props.data.length, 1);
  assert.equal(list.props.data[0].hash, 'correct-network');
  assert.equal(list.props.ListFooterComponent, null);
  f.h.unmount();
});
test('failed continuation preserves loaded history and allows a fresh retry', async () => {
  const f = setup();
  f.render();
  f.h.effects();
  f.pending[0].resolve({ entries: [{ hash: 'retained' }], marker: 'next' });
  await tick();
  f.render().props.ListFooterComponent.props.onPress();
  f.pending[1].reject(new Error('synthetic outage'));
  await tick();
  const list = f.render();
  assert.equal(list.props.data[0].hash, 'retained');
  assert.equal(list.props.ListFooterComponent.props.disabled, false);
  list.props.ListFooterComponent.props.onPress();
  assert.equal(f.pending[2].input.marker, 'next');
  f.h.unmount();
});
