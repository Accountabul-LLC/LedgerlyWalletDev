const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { compile } = require('./harness.cjs');
const project = path.resolve(__dirname, '..');
const coreFile = path.resolve(project, '../../src/ledgerly/core/xrpl/networks.ts');
const hostFile = path.join(project, 'src/nativeNetworks.ts');
const decisionFile = path.join(project, 'src/defaultNetwork.ts');
const sharedSpecifier = '../../../src/ledgerly/core/xrpl/networks';

function loadMetroResolver() {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(project, 'metro.config.js'), 'utf8'), {
    __dirname: project,
    module,
    require: Object.assign(
      (name) => {
        if (name === 'node:path') return path;
        if (name === 'expo/metro-config') return { getDefaultConfig: () => ({ resolver: {} }) };
        throw new Error(`Unexpected module: ${name}`);
      },
      { resolve: require.resolve },
    ),
  });
  return module.exports.resolver.resolveRequest;
}

function runtimeRequires(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return [...js.matchAll(/require\((["'])(.*?)\1\)/g)].map((match) => match[2]);
}

function importedValueNames(file, specifier) {
  const source = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = [];
  parsed.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !node.importClause || node.importClause.isTypeOnly) return;
    if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== specifier)
      return;
    const named = node.importClause.namedBindings;
    if (!named || !ts.isNamedImports(named)) return;
    for (const element of named.elements) {
      if (!element.isTypeOnly) names.push(element.name.text);
    }
  });
  return names;
}

function upstreamResolve(origin, moduleName) {
  if (moduleName === sharedSpecifier) return { type: 'sourceFile', filePath: coreFile };
  const base = path.resolve(path.dirname(origin), moduleName);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Cannot resolve ${moduleName} from ${origin}`);
  return { type: 'sourceFile', filePath: found };
}

test('development endpoint substitution preserves chain identity and upstream validation', () => {
  const core = compile(coreFile);
  const host = compile(hostFile, { '../../../src/ledgerly/core/xrpl/networks': core });
  assert.equal(host.MAINNET.endpoint, 'wss://s2.ripple.com');
  for (const key of Object.keys(core.MAINNET).filter((key) => key !== 'endpoint')) {
    assert.equal(host.MAINNET[key], core.MAINNET[key]);
  }
  assert.equal(core.MAINNET.endpoint, 'wss://xrplcluster.com');
  assert.equal(host.BUILT_IN_NETWORKS[0], host.MAINNET);
  assert.equal(host.BUILT_IN_NETWORKS[1], core.TESTNET);
  assert.equal(host.BUILT_IN_NETWORKS[2], core.DEVNET);
  assert.equal(host.assertSecureEndpoint, core.assertSecureEndpoint);
  assert.equal(host.findNetwork, core.findNetwork);
});

test('Metro substitutes native networks only for native platforms without recursive host imports', () => {
  const resolve = loadMetroResolver();
  const original = { type: 'sourceFile', filePath: coreFile };
  const context = {
    originModulePath: path.resolve(project, '../../src/ledgerly/core/engine/engine.ts'),
    resolveRequest: () => original,
  };
  for (const platform of ['android', 'ios']) {
    assert.equal(resolve(context, './networks', platform).filePath, hostFile);
    assert.equal(
      resolve({ ...context, originModulePath: hostFile }, './networks', platform),
      original,
    );
  }
  assert.equal(resolve(context, './networks', 'web'), original);
  const other = { type: 'sourceFile', filePath: path.join(project, 'App.tsx') };
  assert.equal(resolve({ ...context, resolveRequest: () => other }, './App', 'android'), other);
});

test('defaultNetwork resolution does not make nativeNetworks require itself', () => {
  const resolve = loadMetroResolver();
  const host = compile(hostFile, { [sharedSpecifier]: compile(coreFile) });
  for (const name of importedValueNames(decisionFile, './nativeNetworks')) {
    assert.notEqual(host[name], undefined, name);
  }
  assert.equal(host.TESTNET.id, 'testnet');
  assert.equal(host.DEFAULT_NETWORK_ID, 'mainnet');

  for (const platform of ['android', 'ios']) {
    // Metro keys relative resolutions by the origin directory, not the file.
    // DependencyGraph.resolveDependency uses dirname(originModulePath) whenever
    // the specifier contains a slash.
    const cache = new Map();
    const resolveCached = (origin, specifier) => {
      const originKey = specifier.includes('/') ? path.dirname(origin) : '';
      const key = `${originKey}\0${specifier}\0${platform}`;
      if (cache.has(key)) return cache.get(key);
      const resolved = resolve(
        {
          originModulePath: origin,
          resolveRequest: (context, moduleName) =>
            upstreamResolve(context.originModulePath, moduleName),
        },
        specifier,
        platform,
      );
      cache.set(key, resolved);
      return resolved;
    };
    const walk = (file, stack) => {
      const current = path.normalize(file);
      assert.equal(stack.includes(current), false, `cycle ${[...stack, current].join(' -> ')}`);
      for (const specifier of runtimeRequires(current)) {
        if (!specifier.startsWith('.')) continue;
        const resolved = resolveCached(current, specifier);
        assert.equal(resolved.type, 'sourceFile');
        const target = path.normalize(resolved.filePath);
        assert.notEqual(
          current === path.normalize(hostFile) && target === path.normalize(hostFile),
          true,
          'nativeNetworks.ts resolved to itself',
        );
        walk(target, [...stack, current]);
      }
    };
    walk(decisionFile, []);
    const fromHost = resolveCached(hostFile, sharedSpecifier);
    assert.equal(path.normalize(fromHost.filePath), path.normalize(coreFile));
  }
});
