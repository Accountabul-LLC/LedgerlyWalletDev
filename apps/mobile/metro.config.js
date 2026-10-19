const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repositoryRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(repositoryRoot, 'src/ledgerly')];
// Shared source must use this app's SDK-compatible dependencies, never web React.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Native compilation generates large trees that contain no JavaScript inputs.
// Keeping them out of Metro avoids repeated scans while Gradle is building.
const existingBlocks = config.resolver.blockList ?? [];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...(Array.isArray(existingBlocks) ? existingBlocks : [existingBlocks]),
  ...['android', 'ios'].map(
    (folder) => new RegExp(`^${escapeRegex(path.join(projectRoot, folder))}[/\\\\]`),
  ),
  /[/\\]android[/\\](?:build|\.gradle|\.cxx)[/\\]/,
];

// Substitute only the native KDF host. Its own import resolves to the unchanged
// upstream implementation for validation and Expo Go compatibility.
const sharedKdf = path.join(repositoryRoot, 'src/ledgerly/core/crypto/kdf.ts');
const nativeKdf = path.join(projectRoot, 'src/nativeKdf.ts');
const sharedNetworks = path.join(repositoryRoot, 'src/ledgerly/core/xrpl/networks.ts');
const nativeNetworks = path.join(projectRoot, 'src/nativeNetworks.ts');
const sharedMnemonic = path.join(repositoryRoot, 'src/ledgerly/core/keyring/mnemonic.ts');
const nativeMnemonic = path.join(projectRoot, 'src/nativeMnemonic.ts');
// Metro caches relative imports by directory, so SHA and Argon2 must resolve
// noble's utilities consistently. Bare imports in the adapter resolve upstream.
// `cd apps/mobile && npm ci` installs this app only. The repository copy is
// included when it is present. A missing root package is the only ignored
// error; a missing app install or any other resolve failure still stops Metro.
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
  [nobleHashDirectory(projectRoot, true), nobleHashDirectory(repositoryRoot, false)].filter(
    (dir) => dir !== null,
  ),
);
const nativeScheduler = path.join(repositoryRoot, 'src/ledgerly/native/kdf-scheduler.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    (platform === 'android' || platform === 'ios') &&
    hashDirectories.has(path.dirname(path.normalize(context.originModulePath))) &&
    moduleName === './utils.js'
  )
    return { type: 'sourceFile', filePath: nativeScheduler };
  const result = context.resolveRequest(context, moduleName, platform);
  if (
    (platform === 'android' || platform === 'ios') &&
    result.type === 'sourceFile' &&
    path.normalize(result.filePath) === path.normalize(sharedMnemonic) &&
    path.normalize(context.originModulePath) !== path.normalize(nativeMnemonic)
  ) {
    return { type: 'sourceFile', filePath: nativeMnemonic };
  }
  if (
    (platform === 'android' || platform === 'ios') &&
    result.type === 'sourceFile' &&
    path.normalize(result.filePath) === path.normalize(sharedKdf) &&
    path.normalize(context.originModulePath) !== path.normalize(nativeKdf)
  ) {
    return { type: 'sourceFile', filePath: nativeKdf };
  }
  if (
    (platform === 'android' || platform === 'ios') &&
    result.type === 'sourceFile' &&
    path.normalize(result.filePath) === path.normalize(sharedNetworks) &&
    path.normalize(context.originModulePath) !== path.normalize(nativeNetworks)
  ) {
    return { type: 'sourceFile', filePath: nativeNetworks };
  }
  return result;
};

module.exports = config;
