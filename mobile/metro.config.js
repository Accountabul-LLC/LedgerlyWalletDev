const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// The audited wallet engine lives in the parent package. The phone also shares
// the public activity-report shape, which stays in src/lib so the website and
// the audit keep one path. Metro has to watch both. The phone UI still never
// imports the engine directly.
config.watchFolders = [
  path.join(workspaceRoot, 'src/ledgerly'),
  path.join(workspaceRoot, 'src/lib'),
];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = {
  '@ledgerly/core': path.join(workspaceRoot, 'src/ledgerly/core'),
};
config.resolver.unstable_enablePackageExports = true;

// Noble's default nextTick yields only to microtasks. A wallet KDF runs in
// React Native's UI JavaScript runtime, so it must also yield to native input
// and rendering. Leave the algorithm, parameters and every other helper intact.
// Metro caches relative resolutions by directory, so all noble modules in the
// same directory must resolve this helper consistently, including SHA/Argon2.
// This app's install is required. The parent package is optional because CI
// installs mobile/ alone. Only a missing parent module is ignored; permission
// and other resolve failures still stop configuration.
function nobleHashDirectory(root, required) {
  try {
    return path.dirname(
      path.normalize(require.resolve('@noble/hashes/utils.js', { paths: [root] })),
    );
  } catch (error) {
    if (!required && error?.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
}

const hashDirectories = new Set(
  [nobleHashDirectory(projectRoot, true), nobleHashDirectory(workspaceRoot, false)].filter(
    (dir) => dir !== null,
  ),
);
// Same Argon2id parameters as the audited derivation. Native OpenSSL runs off
// the UI thread. The adapter's own import stays on the JavaScript implementation.
const sharedKdf = path.join(workspaceRoot, 'src/ledgerly/core/crypto/kdf.ts');
const nativeKdf = path.join(projectRoot, 'src/nativeKdf.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    (platform === 'android' || platform === 'ios') &&
    hashDirectories.has(path.dirname(path.normalize(context.originModulePath))) &&
    moduleName === './utils.js'
  ) {
    return { type: 'sourceFile', filePath: path.join(projectRoot, 'src/kdf-scheduler.ts') };
  }
  const result = context.resolveRequest(context, moduleName, platform);
  if (
    (platform === 'android' || platform === 'ios') &&
    result?.type === 'sourceFile' &&
    path.normalize(result.filePath) === path.normalize(sharedKdf) &&
    path.normalize(context.originModulePath) !== path.normalize(nativeKdf)
  ) {
    return { type: 'sourceFile', filePath: nativeKdf };
  }
  return result;
};

module.exports = config;
