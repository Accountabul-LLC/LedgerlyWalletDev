import { isRunningInExpoGo } from 'expo';
import {
  normalizeMnemonic,
  isValidMnemonic,
  mnemonicToMasterSeed as deriveJavaScriptSeed,
} from '../../../src/ledgerly/core/keyring/mnemonic';
import { utf8ToBytes, wipe } from '../../../src/ledgerly/core/crypto/bytes';

export * from '../../../src/ledgerly/core/keyring/mnemonic';

type NativeCrypto = Pick<typeof import('react-native-quick-crypto'), 'pbkdf2'>;
let nativeCrypto: NativeCrypto | undefined;

/** BIP39's unchanged PBKDF2-SHA512 parameters, computed on the native worker. */
export async function mnemonicToMasterSeed(phrase: string, passphrase = ''): Promise<Uint8Array> {
  const normalized = normalizeMnemonic(phrase);
  if (!isValidMnemonic(normalized)) {
    throw new Error('That recovery phrase is not valid. Check the spelling and word order.');
  }
  if (isRunningInExpoGo()) return deriveJavaScriptSeed(normalized, passphrase);
  if (!nativeCrypto) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo Go must never initialize this native module.
      nativeCrypto = require('react-native-quick-crypto') as NativeCrypto;
      if (typeof nativeCrypto.pbkdf2 !== 'function')
        throw new Error('Native PBKDF2 is unavailable.');
    } catch {
      nativeCrypto = undefined;
      throw new Error(
        'Wallet recovery cryptography is unavailable. Install the latest Ledgerly Dev build.',
      );
    }
  }
  const phraseBytes = utf8ToBytes(normalized);
  const saltBytes = utf8ToBytes(`mnemonic${passphrase.normalize('NFKD')}`);
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      nativeCrypto!.pbkdf2(phraseBytes, saltBytes, 2048, 64, 'sha512', (error, bytes) => {
        if (error) {
          if (bytes) wipe(bytes);
          return reject(error);
        }
        if (!bytes || bytes.byteLength !== 64) {
          if (bytes) wipe(bytes);
          return reject(new Error('Native BIP39 returned an invalid seed length.'));
        }
        const seed = new Uint8Array(bytes);
        wipe(bytes);
        resolve(seed);
      });
    });
  } finally {
    wipe(phraseBytes);
    wipe(saltBytes);
  }
}
