const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { compile, hooks, jsx } = require('./harness.cjs');
const project = path.resolve(__dirname, '..');
const tagModule = compile(path.join(project, '../../src/ledgerly/native/destinationTag.ts'));
const codec = require('ripple-address-codec');
const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

test('optional destination tags preserve zero and uint32 boundaries without rewriting input', () => {
  assert.equal(tagModule.parseDestinationTag(''), undefined);
  assert.equal(tagModule.parseDestinationTag('  '), undefined);
  assert.equal(tagModule.parseDestinationTag('0'), 0);
  assert.equal(tagModule.parseDestinationTag('0007'), 7);
  assert.equal(tagModule.parseDestinationTag('4294967295'), 0xffffffff);
  for (const invalid of ['-1', '1.5', '1e3', '1,000', '12abc', '+7', '4294967296']) {
    assert.throws(() => tagModule.parseDestinationTag(invalid), /Destination tags/);
  }
});

function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

test('receive disables invalid tags and shares the exact checksummed address including tag zero', () => {
  const h = hooks();
  const shared = [];
  const { Receive } = compile(
    path.join(project, 'src/WalletHome.tsx'),
    {
      react: h.react,
      'react/jsx-runtime': jsx,
      'react-native-safe-area-context': {},
      'react-native': {
        StyleSheet: { create: (value) => value },
        Platform: { OS: 'android', select: (value) => value.android },
        Share: {
          share: (value) => {
            shared.push(value.message);
            return Promise.resolve();
          },
        },
      },
      '../../../src/ledgerly/core': { toXAddress: codec.classicAddressToXAddress },
      '../../../src/ledgerly/native/latestRequest': {},
      '../assets/ledgerly-icon.png': {},
      './brand': { BRAND: {} },
      './destinationTag': tagModule,
      './WalletManager': { WalletManager: 'WalletManager' },
      './historyDate': {},
      './icons': {},
      './TokenAvatar': {},
      './MarketPanel': {},
    },
    '\nexport { Receive };',
  );
  const render = (isTest = true) =>
    h.render(() => Receive({ address, networkLabel: 'Testnet', isTest, onDone() {} }));
  const field = (view) => find(view, (node) => node.props?.label === 'Destination tag (optional)');
  const share = (view) => find(view, (node) => node.props?.label === 'Share address');
  share(render()).props.onPress();
  assert.equal(shared.pop(), address);
  field(render()).props.onChangeText('4294967296');
  const invalid = share(render());
  assert.equal(invalid.props.disabled, true);
  invalid.props.onPress();
  assert.equal(shared.length, 0);
  field(render()).props.onChangeText('1e3');
  assert.equal(share(render()).props.disabled, true);
  field(render()).props.onChangeText('0');
  share(render()).props.onPress();
  const decoded = codec.xAddressToClassicAddress(shared.pop());
  assert.equal(decoded.classicAddress, address);
  assert.equal(decoded.tag, 0);
  assert.equal(decoded.test, true);
  share(render(false)).props.onPress();
  assert.equal(codec.xAddressToClassicAddress(shared.pop()).test, false);
});
