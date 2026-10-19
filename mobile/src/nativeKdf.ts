import {
  assertKdfParams,
  DEFAULT_KDF_PARAMS,
  deriveVaultKey as deriveJavaScriptKey,
  type DeriveOptions,
  type KdfParams,
} from '../../src/ledgerly/core/crypto/kdf';
import { utf8ToBytes, wipe } from '../../src/ledgerly/core/crypto/bytes';

// Vault creation imports these from the same module as deriveVaultKey. Metro
// serves this file in their place on Android and iOS, so the substitute has to
// export them too. A missing binding is a TypeError on device.
export { assertKdfParams, DEFAULT_KDF_PARAMS };
export type { DeriveOptions, KdfParams };

const DERIVED_KEY_BYTES = 32;

/**
 * What react-native-quick-crypto 1.1.8 actually runs. Its public
 * `argon2(algorithm, params, callback)` helper does
 * `hash(...).then((bytes) => Buffer.from(bytes))`. On Hermes that completion
 * throws "undefined is not a function" when `hash` returns the key instead of
 * a Promise, or when `Buffer.from` was never installed. Call `hash` directly
 * and accept either shape.
 *
 * `install()` from the same package is intentionally not called. It replaces
 * `global.crypto`, which would drop the AES-GCM polyfill the vault seal uses.
 */
export interface NativeArgon2Hash {
  hash(
    algorithm: string,
    message: ArrayBuffer,
    nonce: ArrayBuffer,
    parallelism: number,
    tagLength: number,
    memory: number,
    passes: number,
    version: number,
  ): Promise<ArrayBuffer | ArrayBufferView> | ArrayBuffer | ArrayBufferView;
}

let cached: NativeArgon2Hash | null | undefined;
let testOverride: NativeArgon2Hash | null | undefined;

/** Tests inject a native hash, or null to force the JavaScript derivation. */
export function setNativeArgon2ForTests(backend: NativeArgon2Hash | null | undefined): void {
  testOverride = backend;
}

function moduleArgon2(loaded: { argon2?: unknown; default?: { argon2?: unknown } }): unknown {
  if (typeof loaded.argon2 === 'function') return loaded.argon2;
  if (loaded.default && typeof loaded.default.argon2 === 'function') return loaded.default.argon2;
  return undefined;
}

function loadNativeArgon2(): NativeArgon2Hash | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Optional native module.
    const loaded = require('react-native-quick-crypto') as {
      argon2?: unknown;
      default?: { argon2?: unknown };
    };
    // The package evaluates Nitro's install(). A binary that does not include
    // it throws here and keeps the JavaScript derivation.
    if (typeof moduleArgon2(loaded) !== 'function') return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Optional native module.
    const nitro = require('react-native-nitro-modules') as {
      NitroModules?: { createHybridObject?: (name: string) => NativeArgon2Hash };
    };
    const hybrid = nitro.NitroModules?.createHybridObject?.('Argon2');
    if (!hybrid || typeof hybrid.hash !== 'function') return null;
    return hybrid;
  } catch {
    return null;
  }
}

function nativeArgon2(): NativeArgon2Hash | null {
  if (testOverride !== undefined) return testOverride;
  if (cached !== undefined) return cached;
  cached = loadNativeArgon2();
  return cached;
}

function disableNativeArgon2(): void {
  if (testOverride === undefined) cached = null;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function wipeBuffer(buffer: ArrayBuffer): void {
  try {
    // Nitro may detach the buffer after copying it into the native call.
    new Uint8Array(buffer).fill(0);
  } catch {
    // The password bytes copied above are wiped on their own Uint8Array.
  }
}

function isThenable(value: unknown): value is PromiseLike<ArrayBuffer | ArrayBufferView> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function copyDerivedKey(value: unknown): Uint8Array {
  const view =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : null;
  if (!view || view.byteLength !== DERIVED_KEY_BYTES) {
    throw new Error('Native key derivation returned an invalid key.');
  }
  const key = new Uint8Array(view);
  try {
    view.fill(0);
  } catch {
    // A detached native result was already copied into `key`.
  }
  return key;
}

async function deriveWithNative(
  native: NativeArgon2Hash,
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<Uint8Array> {
  const passwordBytes = utf8ToBytes(password.normalize('NFKC'));
  const message = exactArrayBuffer(passwordBytes);
  const nonce = exactArrayBuffer(salt);
  try {
    // Same fields the 1.1.8 callback API names `memory`, `passes`, and
    // `parallelism`. They are the vault's own Argon2id parameters.
    const parameters = {
      message,
      nonce,
      parallelism: params.p,
      tagLength: DERIVED_KEY_BYTES,
      memory: params.m,
      passes: params.t,
      version: params.version,
    };
    const pending = native.hash(
      'argon2id',
      parameters.message,
      parameters.nonce,
      parameters.parallelism,
      parameters.tagLength,
      parameters.memory,
      parameters.passes,
      parameters.version,
    );
    const raw = isThenable(pending) ? await pending : pending;
    return copyDerivedKey(raw);
  } finally {
    wipe(passwordBytes);
    wipeBuffer(message);
    wipeBuffer(nonce);
  }
}

/**
 * Same Argon2id parameters and vault bytes as the audited JavaScript derivation.
 * A missing or throwing native module falls back in process and does not surface
 * the native error. The next unlock skips a native module that already failed.
 */
export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
  options: DeriveOptions = {},
): Promise<Uint8Array> {
  assertKdfParams(params);
  if (salt.length < 16) throw new Error('key derivation salt must be at least 16 bytes');

  const native = nativeArgon2();
  if (native) {
    let derived: Uint8Array | undefined;
    try {
      derived = await deriveWithNative(native, password, salt, params);
      options.onProgress?.(1);
      return derived;
    } catch (error) {
      if (derived) {
        wipe(derived);
        throw error;
      }
      disableNativeArgon2();
    }
  }
  return deriveJavaScriptKey(password, salt, params, options);
}
