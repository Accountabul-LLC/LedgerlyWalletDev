import { Redirect } from 'expo-router';
import { useWallet } from '../wallet';

/** Unknown links never stay on Expo's unmatched page, including while locked. */
export default function NotFound() {
  const { state } = useWallet();
  if (state.status === 'locked') return <Redirect href="/unlock" />;
  if (state.status === 'unlocked' && state.preferences.backupConfirmed) {
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/" />;
}
