import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { describe, expect, it, vi } from 'vitest';

const projectRoot = resolve('mobile');
const mobileRequire = createRequire(resolve(projectRoot, 'package.json'));
const argon2 = mobileRequire.resolve('@noble/hashes/argon2.js');
const hashUtils = mobileRequire.resolve('@noble/hashes/utils.js');

// Exercise the actual Metro rule without starting a Metro process in Vitest.
type Resolution = { type: string; filePath: string };
type Context = { originModulePath: string; resolveRequest: () => Resolution };
const module = {
  exports: {} as {
    resolver: { resolveRequest: (context: Context, name: string, platform: string) => Resolution };
  },
};
runInNewContext(readFileSync(resolve(projectRoot, 'metro.config.js'), 'utf8'), {
  __dirname: projectRoot,
  module,
  require: Object.assign(
    (name: string) =>
      name === 'expo/metro-config'
        ? { getDefaultConfig: () => ({ resolver: {} }) }
        : mobileRequire(name),
    { resolve: mobileRequire.resolve },
  ),
});
const resolveRequest = module.exports.resolver.resolveRequest;
const utilsResult = { type: 'sourceFile', filePath: hashUtils };
const context = { originModulePath: argon2, resolveRequest: () => utilsResult };

const devRoot = resolve('apps/mobile');
const devRequire = createRequire(resolve(devRoot, 'package.json'));
const devModule = { exports: {} as typeof module.exports };
runInNewContext(readFileSync(resolve(devRoot, 'metro.config.js'), 'utf8'), {
  __dirname: devRoot,
  module: devModule,
  require: Object.assign(
    (name: string) =>
      name === 'expo/metro-config'
        ? { getDefaultConfig: () => ({ resolver: {} }) }
        : devRequire(name),
    { resolve: devRequire.resolve },
  ),
});
const devResolve = devModule.exports.resolver.resolveRequest;

describe('native Argon2 scheduling', () => {
  it('Dev maps noble directories consistently while preserving native hosts and web behavior', () => {
    const expected = resolve('src/ledgerly/native/kdf-scheduler.ts');
    for (const root of [devRoot, process.cwd()]) {
      const entry = devRequire.resolve('@noble/hashes/argon2.js', { paths: [root] });
      for (const origin of [entry, resolve(entry, '../sha2.js')]) {
        const request = { originModulePath: origin, resolveRequest: () => utilsResult };
        expect(devResolve(request, './utils.js', 'android').filePath).toBe(expected);
        expect(devResolve(request, './utils.js', 'ios').filePath).toBe(expected);
        expect(devResolve(request, './utils.js', 'web')).toBe(utilsResult);
      }
    }
    expect(
      devResolve({ ...context, originModulePath: expected }, '@noble/hashes/utils.js', 'android'),
    ).toBe(utilsResult);
    for (const [upstream, host] of [
      ['crypto/kdf.ts', 'nativeKdf.ts'],
      ['keyring/mnemonic.ts', 'nativeMnemonic.ts'],
      ['xrpl/networks.ts', 'nativeNetworks.ts'],
    ]) {
      const result = { type: 'sourceFile', filePath: resolve('src/ledgerly/core', upstream) };
      const native = resolve(devRoot, 'src', host);
      expect(
        devResolve(
          { originModulePath: 'some-screen.tsx', resolveRequest: () => result },
          './module',
          'android',
        ).filePath,
      ).toBe(native);
      expect(
        devResolve(
          { originModulePath: native, resolveRequest: () => result },
          './module',
          'android',
        ),
      ).toBe(result);
    }
  });
  it('resolves noble utilities consistently by directory on native, without recursion', () => {
    const expected = resolve(projectRoot, 'src/kdf-scheduler.ts');
    expect(resolveRequest(context, './utils.js', 'android').filePath).toBe(expected);
    expect(resolveRequest(context, './utils.js', 'ios').filePath).toBe(expected);
    // Metro caches by directory/module name: SHA can resolve this before Argon2.
    expect(
      resolveRequest(
        { ...context, originModulePath: resolve(argon2, '../sha2.js') },
        './utils.js',
        'android',
      ).filePath,
    ).toBe(expected);
    const rootArgon2 = mobileRequire.resolve('@noble/hashes/argon2.js', { paths: [process.cwd()] });
    expect(
      resolveRequest({ ...context, originModulePath: rootArgon2 }, './utils.js', 'android')
        .filePath,
    ).toBe(expected);
    expect(
      resolveRequest(
        {
          originModulePath: rootArgon2,
          resolveRequest: () => ({
            type: 'sourceFile',
            filePath: resolve(rootArgon2, '../utils.js'),
          }),
        },
        './utils.js',
        'android',
      ).filePath,
    ).toBe(expected);
    expect(resolveRequest(context, './utils.js', 'web')).toBe(utilsResult);
    expect(
      resolveRequest(
        { ...context, originModulePath: expected },
        '@noble/hashes/utils.js',
        'android',
      ),
    ).toBe(utilsResult);
    expect(
      resolveRequest(
        { ...context, originModulePath: 'some-other-module.js' },
        './utils.js',
        'android',
      ),
    ).toBe(utilsResult);
  });

  it('preserves Argon2 output and lets timers run during the actual derivation', async () => {
    const result = await build({
      stdin: {
        contents: `export { argon2idAsync } from ${JSON.stringify(argon2)};`,
        resolveDir: projectRoot,
      },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      plugins: [
        {
          name: 'actual-metro-argon2-rule',
          setup(builder) {
            builder.onResolve({ filter: /^\.\/utils\.js$/ }, (args) => {
              if (args.importer !== argon2) return;
              const resolved = resolveRequest(context, args.path, 'android');
              return { path: resolved.filePath };
            });
          },
        },
      ],
    });
    const native = await import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
    );
    const password = new TextEncoder().encode('synthetic-NFKC-Å-password');
    const salt = new Uint8Array(16).fill(7);
    // RN implements setImmediate using microtasks. Exercise that behavior rather
    // than passing only because Node's setImmediate already yields to timers.
    const immediate = vi.spyOn(globalThis, 'setImmediate').mockImplementation((callback) => {
      queueMicrotask(callback);
      return undefined as unknown as ReturnType<typeof setImmediate>;
    });
    try {
      for (const params of [
        { m: 47104, t: 1, p: 1 },
        { m: 19456, t: 2, p: 1 },
        { m: 19456, t: 2, p: 2 },
      ]) {
        const options = { ...params, dkLen: 32, version: 0x13, asyncTick: 8 };
        const expected = await argon2idAsync(password, salt, options);
        let heartbeats = 0;
        const timer = setInterval(() => heartbeats++, 0);
        try {
          const actual = await native.argon2idAsync(password, salt, options);
          expect(actual).toEqual(expected);
          expect(heartbeats).toBeGreaterThan(0);
        } finally {
          clearInterval(timer);
        }
      }
    } finally {
      immediate.mockRestore();
    }
  });
});

type MetroExports = {
  resolver: { resolveRequest: (context: Context, name: string, platform: string) => Resolution };
};

function missingModule(code: string): never {
  const error = new Error(
    code === 'MODULE_NOT_FOUND'
      ? "Cannot find module '@noble/hashes/utils.js'"
      : 'permission denied',
  ) as NodeJS.ErrnoException;
  error.code = code;
  throw error;
}

function loadMetro(
  appDir: string,
  resolveNoble: (root: string | undefined) => string,
): MetroExports {
  const loaded = { exports: {} as MetroExports };
  const appRequire = createRequire(resolve(appDir, 'package.json'));
  runInNewContext(readFileSync(resolve(appDir, 'metro.config.js'), 'utf8'), {
    __dirname: appDir,
    module: loaded,
    require: Object.assign(
      (name: string) =>
        name === 'expo/metro-config'
          ? { getDefaultConfig: () => ({ resolver: {} }) }
          : appRequire(name),
      {
        resolve: (request: string, options?: { paths?: string[] }) => {
          if (request === '@noble/hashes/utils.js') return resolveNoble(options?.paths?.[0]);
          return appRequire.resolve(request, options);
        },
      },
    ),
  });
  return loaded.exports;
}

describe('app-only noble install', () => {
  const shells = [
    {
      name: 'Dev',
      dir: devRoot,
      scheduler: resolve('src/ledgerly/native/kdf-scheduler.ts'),
    },
    {
      name: 'production',
      dir: projectRoot,
      scheduler: resolve(projectRoot, 'src/kdf-scheduler.ts'),
    },
  ];

  for (const shell of shells) {
    it(`${shell.name} loads when the repository root has no noble package`, () => {
      const appUtils = resolve(shell.dir, 'node_modules/@noble/hashes/utils.js');
      const config = loadMetro(shell.dir, (root) => {
        if (root === shell.dir) return appUtils;
        return missingModule('MODULE_NOT_FOUND');
      });
      const fallback = { type: 'sourceFile', filePath: '/fallback/utils.js' };
      const request = {
        originModulePath: resolve(appUtils, '../argon2.js'),
        resolveRequest: () => fallback,
      };
      expect(config.resolver.resolveRequest(request, './utils.js', 'android').filePath).toBe(
        shell.scheduler,
      );
      expect(config.resolver.resolveRequest(request, './utils.js', 'ios').filePath).toBe(
        shell.scheduler,
      );
      expect(config.resolver.resolveRequest(request, './utils.js', 'web')).toBe(fallback);
      expect(
        config.resolver.resolveRequest(
          { ...request, originModulePath: '/virtual/root/node_modules/@noble/hashes/argon2.js' },
          './utils.js',
          'android',
        ),
      ).toBe(fallback);
    });

    it(`${shell.name} still fails when its own noble install is missing`, () => {
      expect(() =>
        loadMetro(shell.dir, (root) => {
          if (root === shell.dir) return missingModule('MODULE_NOT_FOUND');
          return '/virtual/root/node_modules/@noble/hashes/utils.js';
        }),
      ).toThrow(/Cannot find module '@noble\/hashes\/utils\.js'/);
    });

    it(`${shell.name} does not hide an unrelated root resolve error`, () => {
      expect(() =>
        loadMetro(shell.dir, (root) => {
          if (root === shell.dir) return resolve(shell.dir, 'node_modules/@noble/hashes/utils.js');
          return missingModule('EACCES');
        }),
      ).toThrow(/permission denied/);
    });
  }

  it('production keeps Argon2id parameters and runs them natively on Android', () => {
    const config = loadMetro(projectRoot, (root) => {
      if (root === projectRoot) return resolve(projectRoot, 'node_modules/@noble/hashes/utils.js');
      return missingModule('MODULE_NOT_FOUND');
    });
    const shared = resolve('src/ledgerly/core/crypto/kdf.ts');
    const native = resolve(projectRoot, 'src/nativeKdf.ts');
    const delegated = { type: 'sourceFile', filePath: shared };
    expect(
      config.resolver.resolveRequest(
        {
          originModulePath: resolve(projectRoot, 'src/runtime.ts'),
          resolveRequest: () => delegated,
        },
        '../crypto/kdf',
        'android',
      ).filePath,
    ).toBe(native);
    expect(
      config.resolver.resolveRequest(
        { originModulePath: native, resolveRequest: () => delegated },
        '../../src/ledgerly/core/crypto/kdf',
        'android',
      ).filePath,
    ).toBe(shared);
    expect(
      config.resolver.resolveRequest(
        {
          originModulePath: resolve(projectRoot, 'src/runtime.ts'),
          resolveRequest: () => delegated,
        },
        '../crypto/kdf',
        'web',
      ),
    ).toBe(delegated);
    expect(readFileSync(native, 'utf8')).toMatch(/memory: params\.m/);
    expect(readFileSync(native, 'utf8')).not.toMatch(/m:\s*19456/);
  });
});
