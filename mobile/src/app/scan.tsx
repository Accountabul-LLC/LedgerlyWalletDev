import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useRouter } from 'expo-router';
import { useWallet } from '../wallet';
import { Button, Callout, Note, Screen, Title, useLayoutInsets } from '../ui';
import { parseScannedAddress } from '../format';
import { stashScan } from '../scan-result';
import { colors } from '../theme';

export default function ScanScreen() {
  const router = useRouter();
  const insets = useLayoutInsets();
  const { state } = useWallet();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  if (state.status === 'locked') return <Redirect href="/unlock" />;
  if (
    state.status !== undefined &&
    (state.status !== 'unlocked' || !state.preferences.backupConfirmed)
  ) {
    return <Redirect href="/setup" />;
  }

  if (!permission) {
    return (
      <Screen>
        <Title>Scan a QR code</Title>
        <Note>Checking camera permission…</Note>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Title>Scan a QR code</Title>
        <Note>
          Camera access is only used to read a recipient address. It never photographs a recovery
          phrase.
        </Note>
        <Button label="Allow camera" onPress={() => void requestPermission()} />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (locked) return;
          const parsed = parseScannedAddress(data);
          if (!parsed) {
            setError('That code is not an XRP Ledger address.');
            return;
          }
          setLocked(true);
          stashScan(parsed);
          router.replace('/send');
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 24 + insets.bottom,
          left: 20 + insets.left,
          right: 20 + insets.right,
          gap: 12,
        }}
      >
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <Text style={{ color: colors.surface, textAlign: 'center' }}>
          Point at a classic address, X-address, or xrpl: payment URI.
        </Text>
        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
