const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const app = path.resolve(__dirname, '..');
const repository = path.resolve(app, '../..');
const source = readFileSync(path.join(app, 'metro.config.js'), 'utf8');

function load(rootInstalled) {
  const module = { exports: {} };
  const localRequire = (name) =>
    name === 'expo/metro-config' ? { getDefaultConfig: () => ({ resolver: {} }) } : require(name);
  localRequire.resolve = (name, { paths }) => {
    assert.equal(name, '@noble/hashes/utils.js');
    if (!rootInstalled && paths[0] === repository)
      throw Object.assign(new Error('Root dependencies absent'), { code: 'MODULE_NOT_FOUND' });
    return path.join(paths[0], 'node_modules/@noble/hashes/utils.js');
  };
  vm.runInNewContext(source, { require: localRequire, module, __dirname: app });
  return module.exports;
}

for (const rootInstalled of [false, true]) {
  test(`Metro resolves native scheduling with root dependencies ${rootInstalled ? 'present' : 'absent'}`, () => {
    const config = load(rootInstalled);
    const fallback = { type: 'sourceFile', filePath: '/ordinary/module.js' };
    const context = {
      originModulePath: path.join(app, 'node_modules/@noble/hashes/argon2.js'),
      resolveRequest: () => fallback,
    };
    assert.equal(
      config.resolver.resolveRequest(context, './utils.js', 'android').filePath,
      path.join(repository, 'src/ledgerly/native/kdf-scheduler.ts'),
    );
    assert.equal(config.resolver.resolveRequest(context, './utils.js', 'web'), fallback);
    if (rootInstalled) {
      context.originModulePath = path.join(repository, 'node_modules/@noble/hashes/argon2.js');
      assert.equal(
        config.resolver.resolveRequest(context, './utils.js', 'ios').filePath,
        path.join(repository, 'src/ledgerly/native/kdf-scheduler.ts'),
      );
    }
  });
}
