import { Redirect } from 'expo-router';
import { useWallet } from '../wallet';

export default function Gate() {
  const { state } = useWallet();
  const inSetup =
    state.status === 'uninitialized' ||
    (state.status === 'unlocked' && !state.preferences.backupConfirmed);

  if (inSetup) return <Redirect href="/setup" />;
  if (state.status === 'locked') return <Redirect href="/unlock" />;
  return <Redirect href="/(tabs)" />;
}
