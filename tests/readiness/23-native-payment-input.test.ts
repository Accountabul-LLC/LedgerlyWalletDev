import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { toXAddress, dropsToXrp, isValidAddress } from '../../src/ledgerly/core/shared';
import { parseDestinationTag } from '../../src/ledgerly/native/destinationTag';
import { parseScannedAddress } from '../../mobile/src/format';

const require = createRequire(import.meta.url);
const { compile, hooks, jsx, tick } = require('../../apps/mobile/test/harness.cjs');
const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

test('QR payment parsing refuses malformed, ambiguous, and overflowing tags without throwing', () => {
  expect(parseScannedAddress(`xrpl:${address}?dt=0`)).toEqual({ address, destinationTag: '0' });
  expect(parseScannedAddress(`xrpl:${address}?dt=%200007%20`)).toEqual({
    address,
    destinationTag: '7',
  });
  for (const input of [
    `xrpl:%ZZ?dt=0`,
    `xrpl:${address}?dt=-1`,
    `xrpl:${address}?dt=1e3`,
    `xrpl:${address}?dt=4294967296`,
    `xrpl:${address}?dt=0&tag=7`,
  ]) {
    expect(parseScannedAddress(input)).toBeNull();
  }
});
type Node = {
  type?: unknown;
  props?: Record<string, unknown> & { onPress: () => void; onChangeText: (value: string) => void };
};
function find(node: Node | undefined, predicate: (node: Node) => boolean): Node | undefined {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child as Node, predicate);
    if (found) return found;
  }
}
const control = (tree: Node, label: string) => find(tree, (node) => node.props?.label === label)!;
const ui = Object.fromEntries(
  ['Button', 'Callout', 'Card', 'Field', 'Note', 'Screen', 'Title'].map((key) => [key, key]),
);

test('production receive refuses malformed tags and copies the same tag-zero address encoded in its QR', () => {
  const h = hooks();
  const copied: string[] = [];
  const { default: Receive } = compile(resolve('mobile/src/app/receive.tsx'), {
    react: h.react,
    'react/jsx-runtime': jsx,
    'react-native': { Text: 'Text' },
    'expo-router': { useRouter: () => ({ back() {} }) },
    'react-native-qrcode-svg': { __esModule: true, default: 'QRCode' },
    '@ledgerly/core/shared': { toXAddress },
    '../wallet': {
      useWallet: () => ({
        state: {
          accounts: [{ id: 'a', address }],
          activeAccountId: 'a',
          network: { label: 'Testnet', isTest: true },
        },
        openExternal() {},
      }),
    },
    '../ui': ui,
    '../clipboard': {
      copyText: (value: string) => {
        copied.push(value);
      },
    },
    '../format': { explorerAccountUrl: () => null },
    '../theme': { colors: {} },
    '../../../src/ledgerly/native/destinationTag': { parseDestinationTag },
  });
  const render = () => h.render(Receive);
  for (const invalid of ['4294967296', '-1', '1.5', '1e3']) {
    control(render(), 'Destination tag (optional)').props!.onChangeText(invalid);
    const tree = render();
    expect(control(tree, 'Copy address').props!.disabled).toBe(true);
    control(tree, 'Copy address').props!.onPress();
    expect(copied).toEqual([]);
    expect(find(tree, (node) => node.type === 'QRCode')).toBeUndefined();
  }
  control(render(), 'Destination tag (optional)').props!.onChangeText('0');
  const tree = render();
  const encoded = toXAddress(address, 0, true);
  expect(find(tree, (node) => node.type === 'QRCode')!.props!.value).toBe(encoded);
  control(tree, 'Copy address').props!.onPress();
  expect(copied).toEqual([encoded]);
});

function sendHarness(wallet: object) {
  const h = hooks();
  const { default: Send } = compile(resolve('mobile/src/app/send.tsx'), {
    react: h.react,
    'react/jsx-runtime': jsx,
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' },
    'expo-router': { useRouter: () => ({ back() {}, push() {} }) },
    '@ledgerly/core/shared': {
      dropsToXrp,
      isValidAddress,
      formatAmount: String,
      shortenAddress: String,
    },
    '../wallet': {
      useWallet: () => ({
        wallet,
        state: {
          accounts: [{ id: 'a', address, label: 'Test' }],
          activeAccountId: 'a',
          network: { id: 'test', label: 'Testnet', isTest: true },
        },
        openExternal() {},
      }),
    },
    '../ui': ui,
    '../format': { assetTicker: String, ledgerAssetLabel: String, explorerTxUrl: () => null },
    '../scan-result': { takeScan: () => null },
    '../theme': { colors: {}, XRPL_DOCS: '' },
    '../../../src/ledgerly/native/destinationTag': { parseDestinationTag },
    '../activity': { recordSignedPayment() {} },
  });
  const render = () => h.render(Send);
  return { h, render };
}

test('production send preserves a saved payee tag, including zero, and clears an earlier tag for untagged payees', async () => {
  const wallet = {
    listContacts: async () => [
      { id: 'z', label: 'Zero tag', address, destinationTag: 0 },
      { id: 'n', label: 'No tag', address },
    ],
    getPortfolio: async () => ({ tokens: [], summary: { spendableDrops: '99000000' } }),
  };
  const { h, render } = sendHarness(wallet);
  render();
  h.effects();
  await tick();
  control(render(), 'Zero tag').props!.onPress();
  expect(control(render(), 'Recipient').props!.value).toBe(address);
  expect(control(render(), 'Destination tag (optional)').props!.value).toBe('0');
  control(render(), 'No tag').props!.onPress();
  expect(control(render(), 'Destination tag (optional)').props!.value).toBe('');
  control(render(), 'Destination tag (optional)').props!.onChangeText('1e3');
  expect(control(render(), 'Destination tag (optional)').props!.error).toMatch(/not valid/);
});

test('failed confirmation cannot reuse a consumed request and editing does not automatically submit again', async () => {
  let preparedCount = 0;
  let confirmationCount = 0;
  const wallet = {
    listContacts: async () => [],
    getPortfolio: async () => ({ tokens: [], summary: { spendableDrops: '99000000' } }),
    preparePayment: async () => {
      preparedCount++;
      return {
        requestId: 'review-1',
        description: { headline: 'Send 1 XRP', summary: '', fields: [], findings: [] },
      };
    },
    confirmPrepared: async () => {
      confirmationCount++;
      throw new Error('That transaction expired. Build it again.');
    },
    discardPrepared: async () => {},
  };
  const { h, render } = sendHarness(wallet);
  render();
  h.effects();
  await tick();
  control(render(), 'Recipient').props!.onChangeText(address);
  control(render(), 'Amount').props!.onChangeText('1');
  control(render(), 'Review transaction').props!.onPress();
  await tick();
  control(render(), 'Confirm and send').props!.onPress();
  control(render(), 'Yes, send it').props!.onPress();
  await tick();
  const failed = control(render(), 'Yes, send it');
  expect(failed.props!.disabled).toBe(true);
  failed.props!.onPress();
  await tick();
  expect(confirmationCount).toBe(1);
  control(render(), 'Edit and build again').props!.onPress();
  expect(control(render(), 'Recipient').props!.value).toBe(address);
  expect(control(render(), 'Amount').props!.value).toBe('1');
  expect(preparedCount).toBe(1);
});
