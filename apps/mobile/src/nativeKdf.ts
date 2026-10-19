import { isRunningInExpoGo } from 'expo';
import {
  assertKdfParams,
  deriveVaultKey as deriveJavaScriptKey,
  type DeriveOptions,
  type KdfParams,
} from '../../../src/ledgerly/core/crypto/kdf';
import { utf8ToBytes, wipe } from '../../../src/ledgerly/core/crypto/bytes';

export { assertKdfParams, DEFAULT_KDF_PARAMS } from '../../../src/ledgerly/core/crypto/kdf';
export type { DeriveOptions, KdfParams } from '../../../src/ledgerly/core/crypto/kdf';

type NativeCrypto = Pick<typeof import('react-native-quick-crypto'), 'argon2'>;
let nativeCrypto: NativeCrypto | null | undefined;

function loadNativeCrypto(): NativeCrypto | null {
  if (nativeCrypto !== undefined) return nativeCrypto;
  if (isRunningInExpoGo()) {
    nativeCrypto = null;
    return null;
  }
  try {
    // Expo Go lacks this native module. Keep its existing implementation as a
    // compatibility path; standalone builds use the asynchronous native worker.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- The optional native module must not initialize in Expo Go.
    const candidate = require('react-native-quick-crypto') as NativeCrypto;
    if (typeof candidate.argon2 !== 'function') throw new Error('Native Argon2id is unavailable.');
    nativeCrypto = candidate;
  } catch {
    throw new Error('Wallet cryptography is unavailable. Install the latest Ledgerly Dev build.');
  }
  return nativeCrypto;
}

/** Same Argon2id bytes and vault format; only the computation runtime changes. */
export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
  options: DeriveOptions = {},
): Promise<Uint8Array> {
  assertKdfParams(params);
  if (salt.length < 16) throw new Error('key derivation salt must be at least 16 bytes');
  const native = loadNativeCrypto();
  if (!native) return deriveJavaScriptKey(password, salt, params, options);

  const passwordBytes = utf8ToBytes(password.normalize('NFKC'));
  try {
    const result = await new Promise<Uint8Array>((resolve, reject) => {
      native.argon2(
        'argon2id',
        {
          message: passwordBytes,
          nonce: salt,
          parallelism: params.p,
          memory: params.m,
          passes: params.t,
          version: params.version,
          tagLength: 32,
        },
        (error, bytes) => {
          if (error) return reject(error);
          if (bytes.byteLength !== 32) {
            wipe(bytes);
            return reject(new Error('Native key derivation returned an invalid key length.'));
          }
          const key = new Uint8Array(bytes);
          wipe(bytes);
          resolve(key);
        },
      );
    });
    try {
      options.onProgress?.(1);
    } catch (error) {
      wipe(result);
      throw error;
    }
    return result;
  } finally {
    wipe(passwordBytes);
  }
}
