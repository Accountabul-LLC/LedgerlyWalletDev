const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { compile, hooks, jsx, tick, deferred } = require('./harness.cjs');

function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
function setup(wallet) {
  const h = hooks();
  const { WalletManager } = compile(path.resolve(__dirname, '../src/WalletManager.tsx'), {
    react: h.react,
    'react/jsx-runtime': jsx,
    'react-native': {
      StyleSheet: { create: (value) => value },
      View: 'View',
      Text: 'Text',
      Pressable: 'Pressable',
    },
    './brand': { BRAND: {} },
  });
  const render = () =>
    h.render(() =>
      WalletManager({
        wallet,
        state: {
          accounts: [{ id: 'original', label: 'Wallet 1', address: 'public-original' }],
          activeAccountId: 'original',
        },
        runSensitive: (operation) => operation(),
        onStateChanged: async () => {},
        onClose() {},
        controls: { Field: 'Field', Button: 'Button' },
      }),
    );
  const button = (label) => find(render(), (node) => node.props?.label === label);
  render();
  h.effects();
  return { h, render, button };
}

test('a new independent wallet is not committed before acknowledgment and binds the previewed address', async () => {
  const calls = [];
  const wallet = {
    generateRecoveryPhrase: async () => ({ mnemonic: 'non-recoverable synthetic UI fixture' }),
    previewImport: async () => ({ kind: 'mnemonic', address: 'public-new', alreadyPresent: false }),
    addAccountWithOwnPhrase: async (input) => {
      calls.push(input);
      return { id: 'new' };
    },
    selectAccount: async () => {},
  };
  const { render, button } = setup(wallet);
  button('Create independent wallet').props.onPress();
  button('Generate recovery phrase').props.onPress();
  await tick();
  assert.equal(button('Add wallet').props.disabled, true);
  button('Add wallet').props.onPress();
  await tick();
  assert.equal(calls.length, 0);
  find(render(), (node) => node.props?.accessibilityRole === 'checkbox').props.onPress();
  assert.equal(button('Add wallet').props.disabled, false);
  button('Add wallet').props.onPress();
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedAddress, 'public-new');
  assert.equal(calls[0].label, 'Wallet 2');
});

test('duplicate imports are rejected, and a family-seed import binds its confirmed public address', async () => {
  let duplicate = true;
  const calls = [];
  const wallet = {
    previewImport: async () => ({
      kind: 'familySeed',
      address: 'public-imported',
      alreadyPresent: duplicate,
    }),
    importAccount: async (input) => {
      calls.push(input);
      return { id: 'imported' };
    },
    selectAccount: async () => {},
  };
  const { render, button } = setup(wallet);
  button('Import another wallet').props.onPress();
  find(
    render(),
    (node) => node.props?.label === 'Recovery phrase or XRPL secret',
  ).props.onChangeText('non-recoverable-ui-fixture');
  button('Preview wallet').props.onPress();
  await tick();
  assert.equal(button('Add wallet'), undefined);
  assert.equal(calls.length, 0);
  duplicate = false;
  button('Preview wallet').props.onPress();
  await tick();
  button('Add wallet').props.onPress();
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedAddress, 'public-imported');
});

test('leaving a pending generation never reveals or persists its late recovery result', async () => {
  const pending = deferred();
  let writes = 0;
  const { h, render, button } = setup({
    generateRecoveryPhrase: () => pending.promise,
    previewImport: async () => ({ kind: 'mnemonic', address: 'public-new' }),
    addAccountWithOwnPhrase: async () => {
      writes++;
    },
  });
  button('Create independent wallet').props.onPress();
  button('Generate recovery phrase').props.onPress();
  h.unmount();
  pending.resolve({ mnemonic: 'non-recoverable late UI fixture' });
  await tick();
  assert.equal(writes, 0);
  assert.equal(
    find(render(), (node) => node.props?.children === 'Back up this wallet'),
    undefined,
  );
});
test('import failure never echoes the private input through a library error', async () => {
  const privateMarker = 'do-not-display-synthetic-private-input';
  const { render, button } = setup({
    previewImport: async () => {
      throw new Error(privateMarker);
    },
  });
  button('Import another wallet').props.onPress();
  find(
    render(),
    (node) => node.props?.label === 'Recovery phrase or XRPL secret',
  ).props.onChangeText('synthetic-fixture');
  button('Preview wallet').props.onPress();
  await tick();
  const alert = find(render(), (node) => node.props?.accessibilityRole === 'alert');
  assert.equal(alert.props.children.includes(privateMarker), false);
  assert.match(alert.props.children, /Could not update/);
});
test('wallet names stay within the engine 40-character limit', async () => {
  let renamed = 0;
  const { render, button } = setup({
    renameAccount: async () => {
      renamed++;
    },
  });
  button('Rename Wallet 1').props.onPress();
  const field = () => find(render(), (node) => node.props?.label === 'Wallet name');
  assert.equal(field().props.maxLength, 40);
  field().props.onChangeText('x'.repeat(41));
  assert.equal(button('Save wallet name').props.disabled, true);
  button('Save wallet name').props.onPress();
  await tick();
  assert.equal(renamed, 0);
  field().props.onChangeText('x'.repeat(40));
  assert.equal(button('Save wallet name').props.disabled, false);
  button('Save wallet name').props.onPress();
  await tick();
  assert.equal(renamed, 1);
});
