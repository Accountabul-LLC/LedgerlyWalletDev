const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { compile, hooks, jsx, tick, deferred } = require('./harness.cjs');
const project = path.resolve(__dirname, '..');
const repo = path.resolve(project, '../..');
const { ForegroundWallet } = compile(path.join(repo, 'src/ledgerly/native/foreground.ts'));
const { LatestRequest } = compile(path.join(repo, 'src/ledgerly/native/latestRequest.ts'));

function fixture(existing = false) {
  const h = hooks();
  let listener;
  const subscribers = new Set();
  let state = {
    status: existing ? 'locked' : 'uninitialized',
    preferences: { backupConfirmed: false },
  };
  const wallet = {
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    start: async () => {},
    getState: async () => state,
    lock: async () => {
      state = { ...state, status: 'locked' };
      subscribers.forEach((fn) => fn());
    },
    createWallet: async () => {
      state = { ...state, status: 'unlocked' };
      return { mnemonic: 'test-only-placeholder' };
    },
    unlock: async () => {
      state = { ...state, status: 'unlocked' };
    },
    resumePendingBackup: async () => ({ mnemonic: 'test-only-placeholder' }),
    confirmBackup: async () => {
      state = { ...state, preferences: { backupConfirmed: true } };
    },
  };
  const native = {
    AppState: {
      currentState: 'active',
      addEventListener: (_, fn) => {
        listener = fn;
        return { remove() {} };
      },
    },
    StyleSheet: { create: (v) => v },
    Platform: { OS: 'android', select: (v) => v.android },
  };
  const mod = compile(
    path.join(project, 'App.tsx'),
    {
      react: h.react,
      'react/jsx-runtime': jsx,
      'react-native': native,
      'expo-status-bar': {},
      'react-native-safe-area-context': {},
      './assets/ledgerly-icon.png': {},
      './src/auth': {},
      './src/brand': { BRAND: {} },
      './src/sessionValidation': {
        VALIDATION_RETRY_COPY: 'retry',
        validationFailureKind: () => 'retryable',
      },
      './src/wallet': { createNativeWallet: () => wallet },
      './src/WalletHome': { WalletHome: function WalletHome() {} },
      './src/MarketPanel': { MarketPanel: function MarketPanel() {} },
      '../../src/ledgerly/native/foreground': { ForegroundWallet },
    },
    '\nexport { LedgerlyWalletApp, BackupScreen };',
  );
  const render = () =>
    h.render(() =>
      mod.LedgerlyWalletApp({ accountEmail: 'test@example.invalid', onSignOut: async () => {} }),
    );
  return {
    mod,
    h,
    wallet,
    render,
    background: () => listener('background'),
    foreground: () => listener('active'),
    state: () => state,
  };
}

test('backup acknowledgment is accessible and continuing stays disabled until checked', () => {
  const f = fixture();
  const render = () =>
    f.h.render(() =>
      f.mod.BackupScreen({ phrase: 'test-only-placeholder', onConfirmed: async () => {} }),
    );
  const controls = (view) => view.props.children[1].props.children;
  let children = controls(render());
  let checkbox = children.find((child) => child?.props.accessibilityRole === 'checkbox');
  assert.equal(checkbox.props.accessibilityState.checked, false);
  assert.equal(children.at(-1).props.disabled, true);
  checkbox.props.onPress();
  children = controls(render());
  checkbox = children.find((child) => child?.props.accessibilityRole === 'checkbox');
  assert.equal(checkbox.props.accessibilityState.checked, true);
  assert.equal(children.at(-1).props.disabled, false);
  checkbox.props.onPress();
  assert.equal(controls(render()).at(-1).props.disabled, true);
});
test('unmounting the wallet host for public markets invalidates and relocks a pending unlock', async () => {
  const f = fixture(true);
  f.render();
  f.h.effects();
  await tick();
  const pending = deferred();
  const originalUnlock = f.wallet.unlock;
  f.wallet.unlock = async (input) => {
    await pending.promise;
    return originalUnlock(input);
  };
  const operation = f.render().props.onUnlock('synthetic-only');
  f.h.unmount();
  await tick();
  pending.resolve();
  await assert.rejects(operation, /wallet locked/);
  assert.equal(f.state().status, 'locked');
});

test('background removes phrase; returning requires unlock and password-gated backup resumption', async () => {
  const f = fixture();
  f.render();
  f.h.effects();
  await tick();
  await f.render().props.onCreate('fixture-password');
  assert.equal(f.render().type.name, 'BackupScreen');
  f.background();
  await tick();
  assert.notEqual(f.render().type.name, 'BackupScreen');
  f.foreground();
  await tick();
  assert.equal(f.render().type.name, 'UnlockScreen');
  await f.render().props.onUnlock('fixture-password');
  const resume = f.render();
  assert.equal(resume.type.name, 'UnlockScreen');
  assert.equal(resume.props.backup, true);
  await resume.props.onUnlock('fixture-password');
  assert.equal(f.render().type.name, 'BackupScreen');
  await f.render().props.onConfirmed();
  assert.equal(f.render().type.name, 'WalletHome');
  f.h.unmount();
});

test('restart with unconfirmed backup never opens Home after unlock', async () => {
  const f = fixture(true);
  f.render();
  f.h.effects();
  await tick();
  await f.render().props.onUnlock('fixture-password');
  const view = f.render();
  assert.equal(view.type.name, 'UnlockScreen');
  assert.equal(view.props.backup, true);
  f.wallet.resumePendingBackup = async () => {
    throw new Error('Incorrect password.');
  };
  await assert.rejects(view.props.onUnlock('incorrect'), /Incorrect password/);
  assert.notEqual(f.render().type.name, 'WalletHome');
  f.h.unmount();
});

test('an engine auto-lock event clears the visible backup phrase', async () => {
  const f = fixture();
  f.render();
  f.h.effects();
  await tick();
  await f.render().props.onCreate('fixture-password');
  assert.equal(f.render().type.name, 'BackupScreen');
  await f.wallet.lock();
  await tick();
  assert.equal(f.render().type.name, 'UnlockScreen');
  f.h.unmount();
});

test('late unlocked state refresh cannot replace a newer locked snapshot', async () => {
  const f = fixture(true);
  f.render();
  f.h.effects();
  await tick();
  const pending = deferred();
  const original = f.wallet.getState;
  f.wallet.getState = () => pending.promise;
  const unlocking = f.render().props.onUnlock('fixture-password');
  await tick();
  f.wallet.getState = original;
  f.background();
  await tick();
  pending.resolve({ status: 'unlocked', preferences: { backupConfirmed: true } });
  await unlocking;
  await tick();
  f.foreground();
  await tick();
  assert.equal(f.render().type.name, 'UnlockScreen');
  f.h.unmount();
});

test('create finishing after background locks again and never delivers phrase', async () => {
  const f = fixture();
  f.render();
  f.h.effects();
  await tick();
  const pending = deferred();
  const original = f.wallet.createWallet;
  f.wallet.createWallet = async () => {
    await pending.promise;
    return original();
  };
  const work = f.render().props.onCreate('fixture-password');
  const rejected = assert.rejects(work, /wallet locked/);
  f.background();
  await tick();
  pending.resolve();
  await rejected;
  await tick();
  assert.equal(f.state().status, 'locked');
  f.foreground();
  await tick();
  assert.notEqual(f.render().type.name, 'BackupScreen');
  f.h.unmount();
});

test('unlock completing after background/foreground cannot resurrect session', async () => {
  let locked = true;
  const lifecycle = new ForegroundWallet(async () => {
    locked = true;
  });
  const pending = deferred();
  const work = lifecycle.run(async () => {
    await pending.promise;
    locked = false;
  });
  const rejected = assert.rejects(work, /wallet locked/);
  await lifecycle.setActive(false);
  await lifecycle.setActive(true);
  pending.resolve();
  await rejected;
  assert.equal(locked, true);
});

test('foreground wallet rejects new work while inactive', async () => {
  const lifecycle = new ForegroundWallet(async () => {}, false);
  let called = false;
  await assert.rejects(
    lifecycle.run(async () => {
      called = true;
    }),
    /Return to the app/,
  );
  assert.equal(called, false);
});

test('late portfolio for old account cannot replace current account result', async () => {
  const h = hooks();
  const pending = {};
  const wallet = {
    getPortfolio: ({ accountId }) => {
      const request = deferred();
      pending[accountId] = request;
      return request.promise;
    },
  };
  const { WalletHome } = compile(path.join(project, 'src/WalletHome.tsx'), {
    react: h.react,
    'react/jsx-runtime': jsx,
    'react-native-safe-area-context': {},
    'react-native': {
      StyleSheet: { create: (v) => v },
      Platform: { OS: 'android', select: (v) => v.android },
    },
    '../../../src/ledgerly/core': {},
    '../assets/ledgerly-icon.png': {},
    './brand': { BRAND: {} },
    './destinationTag': compile(path.join(project, '../../src/ledgerly/native/destinationTag.ts')),
    './WalletManager': { WalletManager: 'WalletManager' },
    './historyDate': {},
    './icons': {},
    './TokenAvatar': {},
    './MarketPanel': {},
    '../../../src/ledgerly/native/latestRequest': { LatestRequest },
  });
  const render = (id, network = 'testnet') =>
    h.render(() =>
      WalletHome({
        wallet,
        state: {
          accounts: [{ id, address: id, label: id }],
          activeAccountId: id,
          network: { id: network },
          preferences: {},
        },
      }),
    );
  const dashboard = (view) => view.props.children.props.children[1].props.children[0];
  render('A');
  h.effects();
  render('B');
  h.effects();
  pending.B.resolve({ account: 'B' });
  await tick();
  pending.A.resolve({ account: 'A' });
  await tick();
  assert.equal(dashboard(render('B')).props.portfolio.account, 'B');
  assert.equal(dashboard(render('B', 'mainnet')).props.portfolio, null);
  const oldRequest = pending.B;
  h.effects();
  assert.notEqual(pending.B, oldRequest);
  pending.B.resolve({ account: 'B-mainnet' });
  await tick();
  assert.equal(dashboard(render('B', 'mainnet')).props.portfolio.account, 'B-mainnet');
  h.unmount();
});

test('request scope rejects previous network, older refresh and unmounted replies', () => {
  const requests = new LatestRequest();
  requests.setScope('testnet:A');
  const first = requests.begin();
  const second = requests.begin();
  assert.equal(first(), false);
  assert.equal(second(), true);
  requests.setScope('mainnet:A');
  assert.equal(second(), false);
  const third = requests.begin();
  requests.invalidate();
  assert.equal(third(), false);
});

test('pending backup adapter rejects completed/locked wallets and rechecks after reveal', async () => {
  let state = { status: 'unlocked', preferences: { backupConfirmed: false } };
  let exports = 0;
  let lockDuringExport = false;
  class Engine {
    async getState() {
      return state;
    }
    async exportRecoveryPhrase({ password }) {
      exports++;
      if (password !== 'fixture-password') throw new Error('Incorrect password.');
      if (lockDuringExport) state = { ...state, status: 'locked' };
      return { mnemonic: 'test-only-placeholder' };
    }
  }
  const { createNativeWallet } = compile(path.join(project, 'src/wallet.ts'), {
    '../../../src/ledgerly/core': { WalletEngine: Engine, MemorySessionStore: class {} },
    './cryptoRuntime': { installLedgerlyCryptoRuntime() {} },
    './defaultNetwork': { hostDefaultNetworkId: () => 'testnet' },
    './nativeStore': { NativeKeyValueStore: class {} },
    './nativeFunding': { fundAndWait: async () => {} },
  });
  const wallet = createNativeWallet();
  await assert.rejects(wallet.resumePendingBackup({ password: 'wrong' }), /Incorrect password/);
  assert.equal(
    (await wallet.resumePendingBackup({ password: 'fixture-password' })).mnemonic,
    'test-only-placeholder',
  );
  state = { ...state, preferences: { backupConfirmed: true } };
  await assert.rejects(
    wallet.resumePendingBackup({ password: 'fixture-password' }),
    /pending backup/,
  );
  assert.equal(exports, 2);
  state = { status: 'locked', preferences: { backupConfirmed: false } };
  await assert.rejects(
    wallet.resumePendingBackup({ password: 'fixture-password' }),
    /pending backup/,
  );
  state = { ...state, status: 'unlocked' };
  lockDuringExport = true;
  await assert.rejects(
    wallet.resumePendingBackup({ password: 'fixture-password' }),
    /wallet locked/,
  );
  assert.equal('exportRecoveryPhrase' in wallet, false);
});

test('production and development have distinct installed identities and explicit environments', () => {
  const fs = require('node:fs');
  const read = (file) => JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'));
  const prod = read('mobile/app.json').expo;
  const dev = read('apps/mobile/app.json').expo;
  assert.equal(read('apps/mobile/package.json').dependencies['ledgerly-wallet'], undefined);
  assert.equal(prod.android.package, 'com.accountabul.ledgerly');
  assert.equal(dev.android.package, 'com.accountabul.ledgerly.dev');
  assert.notEqual(prod.ios.bundleIdentifier, dev.ios.bundleIdentifier);
  assert.notEqual(prod.scheme, dev.scheme);
  assert.equal(dev.name, 'Ledgerly Dev');
  assert.equal(prod.owner, 'accountabuls');
  assert.equal(dev.owner, 'accountabuls');
  assert.equal(prod.slug, 'phone-app');
  assert.equal(dev.slug, 'ledgerly-dev');
  assert.equal(prod.extra.eas.projectId, 'f99f929c-665b-4dfd-b158-e2321226f637');
  assert.equal(dev.extra.eas.projectId, '8fbd1a0a-d66b-48db-9ea5-7706a30f24dc');
  assert.notEqual(prod.extra.eas.projectId, dev.extra.eas.projectId);
  const devBuild = read('apps/mobile/eas.json').build;
  assert.equal(devBuild.production, undefined);
  for (const profile of Object.values(devBuild)) assert.equal(profile.environment, 'development');
  const prodBuild = read('mobile/eas.json').build;
  assert.equal(prodBuild.production.environment, 'production');
  assert.equal(prodBuild.production.android.buildType, 'app-bundle');
});

test('development Supabase config points at ledgerly-test', () => {
  const fs = require('node:fs');
  const config = fs.readFileSync(path.join(repo, 'supabase/config.toml'), 'utf8');
  const backend = config.match(/^project_id\s*=\s*"([a-z0-9]+)"/m)?.[1];
  assert.equal(backend, 'hwvyrlrmdktgfbqdmufz');
});

test('production authentication fallback stays on the live website project', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.join(repo, 'mobile/src/supabase.ts'), 'utf8');
  assert.ok(source.includes('https://srvzinigfedppxwypmtt.supabase.co'));
  assert.equal(source.includes('vsaouxymljdcbbsissom'), false);
});
