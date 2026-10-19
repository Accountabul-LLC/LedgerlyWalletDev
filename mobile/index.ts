import { Buffer } from 'buffer';
import 'react-native-url-polyfill/auto';
import * as ExpoCrypto from 'expo-crypto';
import { installLedgerlyCrypto } from './src/crypto-polyfill';

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

installLedgerlyCrypto({
  getRandomValues: (array) => {
    ExpoCrypto.getRandomValues(array as never);
    return array;
  },
});

import 'expo-router/entry';
