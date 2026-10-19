const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { compile, hooks, jsx, tick, deferred } = require('./harness.cjs');
const { validationFailureKind, VALIDATION_RETRY_COPY } = compile(
  path.resolve(__dirname, '../src/sessionValidation.ts'),
);

function fixture() {
  const h = hooks();
  const validation = deferred();
  const initial = deferred();
  let listener;
  const signOuts = [];
  const userCalls = [];
  const auth = {
    onAuthStateChange(fn) {
      listener = fn;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    getSession: () => initial.promise,
    getUser: (token) => {
      userCalls.push(token);
      return validation.promise;
    },
    signOut: async (options) => {
      signOuts.push(options ?? null);
      return {};
    },
    startAutoRefresh() {},
    stopAutoRefresh() {},
  };
  const mod = compile(
    path.resolve(__dirname, '../App.tsx'),
    {
      react: h.react,
      'react/jsx-runtime': { ...jsx, jsx: (type, props, key) => ({ type, props, key }) },
      'react-native': {
        AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
        StyleSheet: { create: (v) => v },
        Platform: { OS: 'android', select: (v) => v.android },
      },
      'expo-status-bar': {},
      'react-native-safe-area-context': {},
      './assets/ledgerly-icon.png': {},
      './src/auth': { getAuthConfigurationError: () => null, getSupabaseClient: () => ({ auth }) },
      './src/brand': { BRAND: {} },
      './src/sessionValidation': { validationFailureKind, VALIDATION_RETRY_COPY },
      './src/wallet': {},
      './src/WalletHome': {},
      './src/MarketPanel': { MarketPanel: 'MarketPanel' },
      '../../src/ledgerly/native/foreground': {},
    },
    '\nexport { AuthenticatedApp, LedgerlyWalletApp, AuthScreen, SetupScreen, UnlockScreen, messageOf };',
  );
  const render = () => h.render(() => mod.AuthenticatedApp());
  return {
    h,
    mod,
    auth,
    initial,
    validation,
    signOuts,
    userCalls,
    render,
    event: (...args) => listener(...args),
  };
}
const session = (id) => ({
  access_token: `synthetic-token-${id}`,
  user: { id, email: `${id}@example.invalid` },
});
function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
test('cached INITIAL_SESSION cannot open the wallet before matching server validation', async () => {
  const f = fixture();
  f.render();
  f.h.effects();
  f.initial.resolve({ data: { session: session('a') } });
  await tick();
  f.event('INITIAL_SESSION', session('a'));
  assert.notEqual(f.render().type, f.mod.LedgerlyWalletApp);
  f.validation.resolve({ data: { user: { id: 'a' } }, error: null });
  await tick();
  const host = f.render();
  assert.equal(host.type, f.mod.LedgerlyWalletApp);
  assert.equal(host.key, 'a');
});
test('profile changes hide the old wallet immediately, and late validation cannot undo signout', async () => {
  const f = fixture();
  f.render();
  f.h.effects();
  f.initial.resolve({ data: { session: session('a') } });
  f.validation.resolve({ data: { user: { id: 'a' } }, error: null });
  await tick();
  assert.equal(f.render().type, f.mod.LedgerlyWalletApp);
  const next = deferred();
  f.auth.getUser = () => next.promise;
  f.event('SIGNED_IN', session('b'));
  assert.notEqual(f.render().type, f.mod.LedgerlyWalletApp);
  await tick();
  f.event('SIGNED_OUT', null);
  next.resolve({ data: { user: { id: 'b' } }, error: null });
  await tick();
  assert.equal(f.render().type, f.mod.AuthScreen);
});
test('late getSession cannot overwrite a newer identity event; mismatched user validation rejects', async () => {
  const f = fixture();
  f.render();
  f.h.effects();
  f.event('SIGNED_IN', session('b'));
  await tick();
  f.validation.resolve({ data: { user: { id: 'b' } }, error: null });
  await tick();
  assert.equal(f.render().key, 'b');
  f.initial.resolve({ data: { session: session('a') } });
  await tick();
  assert.equal(f.render().key, 'b');
  f.auth.getUser = async () => ({ data: { user: { id: 'attacker' } }, error: null });
  f.event('SIGNED_IN', session('c'));
  await tick();
  assert.equal(f.render().type, f.mod.AuthScreen);
});
test('initial restore disables secret display/autofill, and unknown errors cannot echo input', () => {
  const f = fixture();
  const render = () => f.h.render(() => f.mod.SetupScreen({ onCreate: async () => {} }));
  find(render(), (n) => n.props?.label === 'Restore').props.onPress();
  const field = find(render(), (n) => n.props?.label === '24-word recovery phrase');
  assert.equal(field.props.secureTextEntry, true);
  assert.equal(field.props.autoComplete, 'off');
  assert.equal(field.props.importantForAutofill, 'no');
  assert.equal(field.props.spellCheck, false);
  assert.equal(
    f.mod.messageOf(new Error('synthetic-private-marker')).includes('synthetic-private-marker'),
    false,
  );
});
test('same-frame repeated setup submit cannot create or restore two vaults', async () => {
  for (const mode of ['Create', 'Restore']) {
    const f = fixture();
    const operation = deferred();
    let calls = 0;
    const render = () =>
      f.h.render(() =>
        f.mod.SetupScreen({
          onCreate: () => {
            calls++;
            return operation.promise;
          },
        }),
      );
    if (mode === 'Restore') find(render(), (n) => n.props?.label === 'Restore').props.onPress();
    find(render(), (n) => n.props?.label === 'Wallet password').props.onChangeText(
      'synthetic-password',
    );
    find(render(), (n) => n.props?.label === 'Confirm password').props.onChangeText(
      'synthetic-password',
    );
    if (mode === 'Restore')
      find(render(), (n) => n.props?.label === '24-word recovery phrase').props.onChangeText(
        'non-recoverable synthetic phrase',
      );
    const button = find(render(), (n) => n.props?.label === `${mode} wallet`);
    button.props.onPress();
    button.props.onPress();
    await tick();
    assert.equal(calls, 1);
    operation.resolve();
    await tick();
  }
});
test('public market browsing does not authenticate or render a wallet host', async () => {
  const f = fixture();
  f.render();
  f.h.effects();
  f.initial.resolve({ data: { session: null } });
  await tick();
  const signIn = f.render();
  assert.equal(signIn.type, f.mod.AuthScreen);
  signIn.props.onExplore();
  const market = f.render();
  assert.equal(find(market, (node) => node.type === 'MarketPanel').props.expanded, true);
  assert.equal(
    find(market, (node) => node.type === f.mod.LedgerlyWalletApp),
    undefined,
  );
  find(market, (node) => node.props?.label === 'Back to sign in').props.onPress();
  assert.equal(f.render().type, f.mod.AuthScreen);
});
test('auth error classifications use fixed copy and never dependency-supplied private detail', () => {
  const f = fixture();
  for (const [code, phrase] of [
    ['invalid_credentials', 'incorrect'],
    ['email_not_confirmed', 'Confirm your email'],
    ['bad_jwt', 'configuration'],
    ['ERR_WRITE', 'Secure account storage'],
    ['over_request_rate_limit', 'Too many attempts'],
  ]) {
    const error = Object.assign(new Error('synthetic-private-marker'), { code });
    assert.match(f.mod.messageOf(error), new RegExp(phrase));
    assert.equal(f.mod.messageOf(error).includes('synthetic-private-marker'), false);
  }
  assert.match(
    f.mod.messageOf({ name: 'AuthRetryableFetchError', message: 'private-marker' }),
    /connection/,
  );
});
test('a validated profile can browse public markets without rendering a wallet host', async () => {
  const f = fixture();
  f.render();
  f.h.effects();
  f.initial.resolve({ data: { session: session('a') } });
  f.validation.resolve({ data: { user: { id: 'a' } }, error: null });
  await tick();
  const host = f.render();
  assert.equal(host.type, f.mod.LedgerlyWalletApp);
  host.props.onExploreMarkets();
  const market = f.render();
  assert.equal(find(market, (node) => node.type === 'MarketPanel').props.expanded, true);
  assert.equal(
    find(market, (node) => node.type === f.mod.LedgerlyWalletApp),
    undefined,
  );
  find(market, (node) => node.props?.label === 'Back to Ledgerly').props.onPress();
  assert.equal(f.render().type, f.mod.LedgerlyWalletApp);
});
test('market exploration remains available while a wallet unlock is pending', async () => {
  const f = fixture();
  const operation = deferred();
  let explored = 0;
  const render = () =>
    f.h.render(() =>
      f.mod.UnlockScreen({ onUnlock: () => operation.promise, onExploreMarkets: () => explored++ }),
    );
  find(render(), (node) => node.props?.label === 'Wallet password').props.onChangeText(
    'synthetic-only',
  );
  find(render(), (node) => node.props?.label === 'Unlock').props.onPress();
  await tick();
  const explore = find(render(), (node) => node.props?.label === 'Explore XRPL markets');
  assert.notEqual(explore.props.disabled, true);
  explore.props.onPress();
  assert.equal(explored, 1);
  operation.resolve();
  await tick();
});
test('transient validation failures keep the saved session closed and retry without storage loss', async () => {
  const failures = [
    {
      name: 'AuthRetryableFetchError',
      status: 0,
      message: 'Network request failed private-marker',
    },
    { status: 504, message: 'gateway timeout private-marker' },
    { status: 429, code: 'over_request_rate_limit', message: 'private-marker' },
  ];
  for (const error of failures) {
    const f = fixture();
    f.render();
    f.h.effects();
    f.initial.resolve({ data: { session: session('a') } });
    await tick();
    assert.deepEqual(f.userCalls, ['synthetic-token-a']);
    f.validation.resolve({ data: { user: null }, error });
    await tick();
    const paused = f.render();
    assert.notEqual(paused.type, f.mod.LedgerlyWalletApp);
    assert.equal(f.signOuts.length, 0);
    assert.equal(JSON.stringify(paused).includes('private-marker'), false);
    assert.equal(
      find(paused, (node) => node.props?.children === VALIDATION_RETRY_COPY).props.children,
      VALIDATION_RETRY_COPY,
    );
    const next = deferred();
    f.auth.getUser = () => next.promise;
    find(paused, (node) => node.props?.label === 'Try again').props.onPress();
    await tick();
    assert.notEqual(f.render().type, f.mod.LedgerlyWalletApp);
    next.resolve({ data: { user: { id: 'a' } }, error: null });
    await tick();
    const host = f.render();
    assert.equal(host.type, f.mod.LedgerlyWalletApp);
    assert.equal(host.key, 'a');
    assert.equal(f.signOuts.length, 0);
  }
});
test('invalid tokens and identity mismatches clear stored credentials and stay signed out', async () => {
  const invalid = fixture();
  invalid.render();
  invalid.h.effects();
  invalid.initial.resolve({ data: { session: session('a') } });
  invalid.validation.resolve({
    data: { user: null },
    error: { status: 401, code: 'bad_jwt', message: 'private-marker' },
  });
  await tick();
  assert.equal(invalid.signOuts.length, 1);
  assert.equal(invalid.signOuts[0].scope, 'local');
  assert.equal(invalid.render().type, invalid.mod.AuthScreen);
  assert.equal(
    find(invalid.render(), (node) => node.props?.label === 'Try again'),
    undefined,
  );

  const mismatch = fixture();
  mismatch.render();
  mismatch.h.effects();
  mismatch.initial.resolve({ data: { session: session('a') } });
  mismatch.validation.resolve({ data: { user: { id: 'a' } }, error: null });
  await tick();
  mismatch.auth.getUser = async (token) => {
    mismatch.userCalls.push(token);
    return { data: { user: { id: 'someone-else' } }, error: null };
  };
  mismatch.event('SIGNED_IN', session('b'));
  await tick();
  assert.equal(mismatch.render().type, mismatch.mod.AuthScreen);
  assert.equal(mismatch.signOuts.length, 1);
  assert.equal(mismatch.signOuts[0].scope, 'local');
  assert.equal(mismatch.userCalls.at(-1), 'synthetic-token-b');
});
test('stale validation generations cannot erase or reopen a newer auth result', async () => {
  const f = fixture();
  f.render();
  f.h.effects();
  const first = deferred();
  const second = deferred();
  let calls = 0;
  f.auth.getUser = (token) => {
    f.userCalls.push(token);
    return ++calls === 1 ? first.promise : second.promise;
  };
  f.initial.resolve({ data: { session: session('a') } });
  await tick();
  f.event('SIGNED_IN', session('b'));
  await tick();
  first.resolve({ data: { user: null }, error: { status: 401, code: 'session_not_found' } });
  await tick();
  assert.equal(f.signOuts.length, 0);
  assert.notEqual(f.render().type, f.mod.LedgerlyWalletApp);
  second.resolve({ data: { user: { id: 'b' } }, error: null });
  await tick();
  assert.equal(f.render().key, 'b');
  assert.equal(f.signOuts.length, 0);

  const late = deferred();
  f.auth.getUser = () => late.promise;
  f.event('SIGNED_IN', session('c'));
  await tick();
  f.event('SIGNED_OUT', null);
  late.resolve({ data: { user: { id: 'c' } }, error: null });
  await tick();
  assert.equal(f.render().type, f.mod.AuthScreen);
  assert.equal(f.signOuts.length, 0);
});
test('validation classification retains unknown outages and clears documented token failures', () => {
  assert.equal(validationFailureKind({ name: 'AuthRetryableFetchError' }), 'retryable');
  assert.equal(
    validationFailureKind({ status: 429, code: 'over_request_rate_limit' }),
    'retryable',
  );
  assert.equal(validationFailureKind({ status: 504, message: 'timeout' }), 'retryable');
  assert.equal(validationFailureKind({ message: 'Failed to fetch' }), 'retryable');
  assert.equal(validationFailureKind(new Error('synthetic-private-marker')), 'retryable');
  assert.equal(validationFailureKind({ status: 401, code: 'bad_jwt' }), 'invalid');
  assert.equal(validationFailureKind({ code: 'user_not_found' }), 'invalid');
  assert.equal(validationFailureKind(null), 'invalid');
});
