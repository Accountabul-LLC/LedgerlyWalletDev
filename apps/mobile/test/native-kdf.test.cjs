const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { compile } = require('./harness.cjs');
const project = path.resolve(__dirname, '..');
const repo = path.resolve(project, '../..');
const bytes = {
  utf8ToBytes: (value) => new TextEncoder().encode(value),
  wipe: (value) => value.fill(0),
};

async function fixture(native, expoGo = native === null) {
  const { argon2idAsync } = await import('@noble/hashes/argon2.js');
  const original = compile(path.join(repo, 'src/ledgerly/core/crypto/kdf.ts'), {
    '@noble/hashes/argon2.js': { argon2idAsync },
    './bytes': bytes,
  });
  const host = compile(path.join(project, 'src/nativeKdf.ts'), {
    '../../../src/ledgerly/core/crypto/kdf': original,
    '../../../src/ledgerly/core/crypto/bytes': bytes,
    expo: { isRunningInExpoGo: () => expoGo },
    ...(native ? { 'react-native-quick-crypto': native } : {}),
  });
  return { original, host };
}

test('native parameter mapping produces the same key as the existing JavaScript vault KDF', async () => {
  const f = await fixture({ argon2: crypto.argon2 });
  const salt = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
  for (const params of [
    f.original.DEFAULT_KDF_PARAMS,
    { ...f.original.DEFAULT_KDF_PARAMS, m: 19456, t: 2, p: 2 },
  ]) {
    const expected = await f.original.deriveVaultKey('Test-only-\u212B-password', salt, params);
    const result = await f.host.deriveVaultKey('Test-only-A\u030A-password', salt, params);
    assert.deepEqual(Buffer.from(result), Buffer.from(expected));
    bytes.wipe(result);
    bytes.wipe(expected);
  }
});

test('a standalone build with missing native crypto fails clearly rather than entering the slow fallback', async () => {
  const f = await fixture(null, false);
  await assert.rejects(
    f.host.deriveVaultKey('test', new Uint8Array(16), f.original.DEFAULT_KDF_PARAMS),
    /Install the latest/,
  );
});

test('Expo Go compatibility retains the original algorithm and parameters', async () => {
  const f = await fixture(null);
  const salt = new Uint8Array(16).fill(7);
  const expected = await f.original.deriveVaultKey(
    'Test-only-password',
    salt,
    f.original.DEFAULT_KDF_PARAMS,
  );
  const result = await f.host.deriveVaultKey(
    'Test-only-password',
    salt,
    f.original.DEFAULT_KDF_PARAMS,
  );
  assert.deepEqual(Buffer.from(result), Buffer.from(expected));
  bytes.wipe(result);
  bytes.wipe(expected);
});

test('native host rejects weak parameters and short salts before invoking native crypto', async () => {
  let calls = 0;
  const f = await fixture({
    argon2() {
      calls++;
    },
  });
  await assert.rejects(
    f.host.deriveVaultKey('test', new Uint8Array(16), { ...f.original.DEFAULT_KDF_PARAMS, m: 1 }),
    /minimum/,
  );
  await assert.rejects(
    f.host.deriveVaultKey('test', new Uint8Array(8), f.original.DEFAULT_KDF_PARAMS),
    /salt/,
  );
  await assert.rejects(
    f.host.deriveVaultKey('test', new Uint8Array(16), {
      ...f.original.DEFAULT_KDF_PARAMS,
      version: 16,
    }),
    /version/,
  );
  assert.equal(calls, 0);
});

test('native failure propagates and password bytes are wiped without falling back', async () => {
  let password;
  const f = await fixture({
    argon2(_algorithm, params, callback) {
      password = params.message;
      callback(new Error('test native failure'), Buffer.alloc(0));
    },
  });
  await assert.rejects(
    f.host.deriveVaultKey('Test-only-password', new Uint8Array(16), f.original.DEFAULT_KDF_PARAMS),
    /native failure/,
  );
  assert.ok(password.every((value) => value === 0));
});

test('invalid output is rejected and both password and native output are wiped', async () => {
  let password;
  const output = Buffer.alloc(12, 1);
  const f = await fixture({
    argon2(_algorithm, params, callback) {
      password = params.message;
      callback(null, output);
    },
  });
  await assert.rejects(
    f.host.deriveVaultKey('Test-only-password', new Uint8Array(16), f.original.DEFAULT_KDF_PARAMS),
    /key length/,
  );
  assert.ok(password.every((value) => value === 0));
  assert.ok(output.every((value) => value === 0));
});
