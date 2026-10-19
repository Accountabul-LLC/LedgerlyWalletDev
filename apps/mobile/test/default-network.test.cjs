const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { compile } = require('./harness.cjs');

const project = path.resolve(__dirname, '..');
const repo = path.resolve(project, '../..');
const networksFile = path.join(repo, 'src/ledgerly/core/xrpl/networks.ts');
const engineFile = path.join(repo, 'src/ledgerly/core/engine/engine.ts');
const decisionFile = path.join(project, 'src/defaultNetwork.ts');
const hostNetworksFile = path.join(project, 'src/nativeNetworks.ts');
const walletFile = path.join(project, 'src/wallet.ts');
const networksImport = '../../../src/ledgerly/core/xrpl/networks';

const core = compile(networksFile);
const hostNetworks = compile(hostNetworksFile, { [networksImport]: core });

function load(file, sandbox) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require: (id) => {
      if (id === './nativeNetworks') return hostNetworks;
      throw new Error(`Unexpected dependency: ${id}`);
    },
    process: sandbox.process,
    __DEV__: sandbox.__DEV__,
  });
  return exports;
}

test('core default stays Mainnet and a saved network is never replaced', () => {
  assert.equal(core.DEFAULT_NETWORK_ID, 'mainnet');
  assert.equal(core.DEFAULT_NETWORK_ID, core.MAINNET.id);
  assert.equal(core.TESTNET.id, 'testnet');
  assert.equal(core.initialNetworkId('mainnet', 'testnet'), 'mainnet');
  assert.equal(core.initialNetworkId('testnet', 'mainnet'), 'testnet');
  assert.equal(core.initialNetworkId('devnet', 'testnet'), 'devnet');
  assert.equal(core.initialNetworkId(undefined, 'testnet'), 'testnet');
  assert.equal(core.initialNetworkId(null, 'testnet'), 'testnet');
  assert.equal(core.initialNetworkId('', 'testnet'), 'testnet');
  assert.equal(core.initialNetworkId('   ', 'testnet'), 'testnet');
  assert.equal(core.initialNetworkId(undefined, undefined), core.DEFAULT_NETWORK_ID);
  assert.equal(core.initialNetworkId(undefined, ''), core.DEFAULT_NETWORK_ID);
  assert.equal(core.initialNetworkId(undefined, null), core.DEFAULT_NETWORK_ID);
});

test('dev, development, preview, and simulator default to Testnet; production keeps Mainnet', () => {
  const production = { productionDefaultNetworkId: core.DEFAULT_NETWORK_ID };
  const cases = [
    [{ dev: true, buildProfile: undefined, ...production }, 'testnet'],
    [{ dev: true, buildProfile: '', ...production }, 'testnet'],
    [{ dev: true, buildProfile: 'dev', ...production }, 'testnet'],
    [{ dev: false, buildProfile: 'development', ...production }, 'testnet'],
    [{ dev: false, buildProfile: 'preview', ...production }, 'testnet'],
    [{ dev: false, buildProfile: 'Preview', ...production }, 'testnet'],
    [{ dev: false, buildProfile: 'simulator', ...production }, 'testnet'],
    [{ dev: false, buildProfile: 'production', ...production }, core.DEFAULT_NETWORK_ID],
    [{ dev: true, buildProfile: 'production', ...production }, core.DEFAULT_NETWORK_ID],
    [{ dev: false, buildProfile: undefined, ...production }, core.DEFAULT_NETWORK_ID],
    [{ dev: false, buildProfile: '', ...production }, core.DEFAULT_NETWORK_ID],
    [{ dev: false, buildProfile: 'store', ...production }, core.DEFAULT_NETWORK_ID],
  ];
  const decision = load(decisionFile, { process: { env: {} }, __DEV__: false });
  for (const [signals, expected] of cases) {
    assert.equal(decision.resolveDefaultNetworkId(signals), expected, JSON.stringify(signals));
  }
  assert.equal(decision.resolveDefaultNetworkId({ dev: false }), core.DEFAULT_NETWORK_ID);
});

test('runtime host reads __DEV__ and the public build profile, and release with no profile stays on Mainnet', () => {
  const unset = load(decisionFile, { process: { env: {} }, __DEV__: false });
  assert.equal(unset.hostDefaultNetworkId(), core.DEFAULT_NETWORK_ID);

  const dev = load(decisionFile, { process: { env: {} }, __DEV__: true });
  assert.equal(dev.hostDefaultNetworkId(), 'testnet');

  const emptyProfile = load(decisionFile, {
    process: { env: { EXPO_PUBLIC_LEDGERLY_BUILD_PROFILE: '' } },
    __DEV__: true,
  });
  assert.equal(emptyProfile.hostDefaultNetworkId(), 'testnet');

  for (const profile of ['development', 'preview', 'simulator']) {
    const release = load(decisionFile, {
      process: { env: { EXPO_PUBLIC_LEDGERLY_BUILD_PROFILE: profile } },
      __DEV__: false,
    });
    assert.equal(release.hostDefaultNetworkId(), 'testnet', profile);
  }

  const production = load(decisionFile, {
    process: { env: { EXPO_PUBLIC_LEDGERLY_BUILD_PROFILE: 'production' } },
    __DEV__: true,
  });
  assert.equal(production.hostDefaultNetworkId(), core.DEFAULT_NETWORK_ID);
});

test('EAS non-production profiles publish their profile name and production does not opt into Testnet', () => {
  const devBuild = JSON.parse(fs.readFileSync(path.join(project, 'eas.json'), 'utf8')).build;
  assert.deepEqual(Object.keys(devBuild).sort(), ['development', 'preview', 'simulator']);
  for (const [name, profile] of Object.entries(devBuild)) {
    assert.equal(profile.env.EXPO_PUBLIC_LEDGERLY_BUILD_PROFILE, name);
  }
  const example = fs.readFileSync(path.join(project, '.env.example'), 'utf8');
  const declared = example
    .split('\n')
    .find((line) => line.startsWith('EXPO_PUBLIC_LEDGERLY_BUILD_PROFILE='));
  assert.equal(declared, 'EXPO_PUBLIC_LEDGERLY_BUILD_PROFILE=');

  const production = JSON.parse(fs.readFileSync(path.join(repo, 'mobile/eas.json'), 'utf8')).build
    .production;
  assert.equal(production.env?.EXPO_PUBLIC_LEDGERLY_BUILD_PROFILE, undefined);
});

test('the engine applies the host default only when no network is saved, and the dev wallet passes it', () => {
  const engine = fs.readFileSync(engineFile, 'utf8');
  assert.match(engine, /initialNetworkId\(stored\.networkId, this\.options\.defaultNetworkId\)/);
  assert.match(engine, /networkId: DEFAULT_NETWORK_ID/);

  const host = compile(hostNetworksFile, { [networksImport]: core });
  assert.equal(host.DEFAULT_NETWORK_ID, core.DEFAULT_NETWORK_ID);
  assert.equal(host.initialNetworkId, core.initialNetworkId);

  const constructed = [];
  let profileDefault = 'testnet';
  const wallet = compile(walletFile, {
    '../../../src/ledgerly/core': {
      MemorySessionStore: class MemorySessionStore {},
      WalletEngine: class WalletEngine {
        constructor(options) {
          constructed.push(options);
        }
      },
    },
    './cryptoRuntime': { installLedgerlyCryptoRuntime() {} },
    './defaultNetwork': { hostDefaultNetworkId: () => profileDefault },
    './nativeStore': { NativeKeyValueStore: class NativeKeyValueStore {} },
    './nativeFunding': { fundAndWait() {} },
  });
  wallet.createNativeWallet();
  assert.equal(constructed.at(-1).defaultNetworkId, 'testnet');
  profileDefault = core.DEFAULT_NETWORK_ID;
  wallet.createNativeWallet();
  assert.equal(constructed.at(-1).defaultNetworkId, core.DEFAULT_NETWORK_ID);
});
