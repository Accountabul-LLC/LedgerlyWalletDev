const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const { generateMnemonic, validateMnemonic, mnemonicToSeed } = require('@scure/bip39');
const { wordlist } = require('@scure/bip39/wordlists/english.js');
const { compile } = require('./harness.cjs');
const file = path.resolve(__dirname, '../src/nativeMnemonic.ts');
const original = {
  normalizeMnemonic: (value) => value.normalize('NFKD').trim().toLowerCase().replace(/\s+/g, ' '),
  isValidMnemonic: (value) => validateMnemonic(value, wordlist),
  mnemonicToMasterSeed: (phrase, passphrase) => mnemonicToSeed(phrase, passphrase),
};
function host(native, go = false) {
  return compile(file, {
    expo: { isRunningInExpoGo: () => go },
    '../../../src/ledgerly/core/keyring/mnemonic': original,
    '../../../src/ledgerly/core/crypto/bytes': {
      utf8ToBytes: (value) => new TextEncoder().encode(value),
      wipe: (value) => value.fill(0),
    },
    'react-native-quick-crypto': native,
  });
}

test('native BIP39 matches the original bytes and Unicode passphrase normalization, and wipes native buffers', async () => {
  const phrase = generateMnemonic(wordlist, 256);
  for (const passphrase of ['', 'caf\u00e9']) {
    let inputs, output;
    const native = {
      pbkdf2(p, s, rounds, size, digest, callback) {
        assert.equal(rounds, 2048);
        assert.equal(size, 64);
        assert.equal(digest, 'sha512');
        inputs = [p, s];
        crypto.pbkdf2(p, s, rounds, size, digest, (error, bytes) => {
          output = bytes;
          callback(error, bytes);
        });
      },
    };
    const seed = await host(native).mnemonicToMasterSeed(
      '  ' + phrase.toUpperCase().replaceAll(' ', '  ') + '  ',
      passphrase,
    );
    const expected = await mnemonicToSeed(phrase, passphrase);
    assert.ok(
      crypto.timingSafeEqual(seed, expected),
      'Native derivation must reproduce the original master seed',
    );
    assert.ok(
      inputs.every((bytes) => bytes.every((byte) => byte === 0)),
      'Input buffers must be wiped',
    );
    assert.ok(
      output.every((byte) => byte === 0),
      'Native result buffer must be wiped after copying',
    );
    seed.fill(0);
    expected.fill(0);
  }
});

test('Expo Go retains the original BIP39 algorithm without initializing native crypto', async () => {
  const phrase = generateMnemonic(wordlist, 128);
  const seed = await host(undefined, true).mnemonicToMasterSeed(phrase);
  const expected = await mnemonicToSeed(phrase);
  assert.ok(crypto.timingSafeEqual(seed, expected), 'Expo Go compatibility must be preserved');
  seed.fill(0);
  expected.fill(0);
});

test('invalid recovery input and unavailable standalone crypto fail before deriving a seed', async () => {
  let calls = 0;
  await assert.rejects(
    host({
      pbkdf2() {
        calls++;
      },
    }).mnemonicToMasterSeed('invalid'),
    /not valid/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    host({}).mnemonicToMasterSeed(generateMnemonic(wordlist)),
    /cryptography is unavailable/,
  );
});

test('native errors and invalid seed lengths reject and wipe inputs and output', async () => {
  const phrase = generateMnemonic(wordlist);
  for (const fails of [true, false]) {
    let inputs, output;
    const native = {
      pbkdf2(p, s, _rounds, _size, _digest, callback) {
        inputs = [p, s];
        output = Buffer.alloc(63, 7);
        callback(fails ? new Error('native failure') : null, output);
      },
    };
    await assert.rejects(
      host(native).mnemonicToMasterSeed(phrase),
      /native failure|invalid seed length/,
    );
    assert.ok(inputs.every((bytes) => bytes.every((byte) => byte === 0)));
    assert.ok(output.every((byte) => byte === 0));
  }
});

test('Metro selects the native BIP39 host only for phone platforms and excludes its upstream import', () => {
  const project = path.resolve(__dirname, '..');
  const repository = path.resolve(project, '../..');
  const shared = path.join(repository, 'src/ledgerly/core/keyring/mnemonic.ts');
  const native = path.join(project, 'src/nativeMnemonic.ts');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(project, 'metro.config.js'), 'utf8'), {
    __dirname: project,
    module,
    require: Object.assign(
      (name) => (name === 'node:path' ? path : { getDefaultConfig: () => ({ resolver: {} }) }),
      { resolve: require.resolve },
    ),
  });
  const context = {
    originModulePath: path.join(project, 'src/wallet.ts'),
    resolveRequest: () => ({ type: 'sourceFile', filePath: shared }),
  };
  for (const platform of ['android', 'ios'])
    assert.equal(
      module.exports.resolver.resolveRequest(context, './mnemonic', platform).filePath,
      native,
    );
  assert.equal(
    module.exports.resolver.resolveRequest(context, './mnemonic', 'web').filePath,
    shared,
  );
  assert.equal(
    module.exports.resolver.resolveRequest(
      { ...context, originModulePath: native },
      './mnemonic',
      'android',
    ).filePath,
    shared,
  );
});
