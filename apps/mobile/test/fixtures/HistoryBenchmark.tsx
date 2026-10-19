import { Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Activity } from '../../src/WalletHome';
import type { NativeWallet } from '../../src/wallet';
import type { HistoryEntry, WalletState } from '../../../../src/ledgerly/core';

const entries: HistoryEntry[] = Array.from({ length: 1000 }, (_, i) => ({
  hash: `synthetic-${i}`,
  type: 'Payment',
  direction: i % 2 ? 'out' : 'in',
  headline: `Fixture payment ${i + 1}`,
  amount: '1 XRP',
  counterparty: null,
  timestamp: 1700000000000 + i * 1000,
  succeeded: true,
  feeXrp: '0.000012',
}));
const wallet: Pick<NativeWallet, 'getHistory'> = {
  getHistory: async () => ({ entries, marker: undefined }),
};
const state = {
  network: { id: 'testnet', label: 'Synthetic Testnet', isTest: true },
} as WalletState;

/** Opt-in local benchmark entry only. No profile, vault, signing, or network access. */
export default function HistoryBenchmark() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ padding: 18 }}>
          <Text>Synthetic history fixture — 1000 records</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Activity wallet={wallet} state={state} accountId="synthetic-only" />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
