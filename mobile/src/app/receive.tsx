import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { toXAddress } from '@ledgerly/core/shared';
import { useWallet } from '../wallet';
import { Button, Callout, Card, Field, Note, Screen, Title } from '../ui';
import { copyText } from '../clipboard';
import { explorerAccountUrl } from '../format';
import { colors } from '../theme';
import { parseDestinationTag } from '../../../src/ledgerly/native/destinationTag';

export default function ReceiveScreen() {
  const router = useRouter();
  const { state, openExternal } = useWallet();
  const account =
    state.accounts.find((item) => item.id === state.activeAccountId) ?? state.accounts[0];
  const [tag, setTag] = useState('');

  const receive = useMemo(() => {
    if (!account) return { value: '', error: null };
    try {
      const parsed = parseDestinationTag(tag);
      return {
        value:
          parsed === undefined
            ? account.address
            : toXAddress(account.address, parsed, state.network.isTest),
        error: null,
      };
    } catch (caught) {
      return {
        value: '',
        error: caught instanceof Error ? caught.message : 'Could not encode this address.',
      };
    }
  }, [account, tag, state.network.isTest]);
  const shareValue = receive.value;

  if (state.status === 'locked') return <Redirect href="/unlock" />;
  if (
    state.status !== undefined &&
    (state.status !== 'unlocked' || !state.preferences.backupConfirmed)
  ) {
    return <Redirect href="/setup" />;
  }

  if (!account) {
    return (
      <Screen>
        <Title>Receive</Title>
        <Note>No account on this device yet.</Note>
      </Screen>
    );
  }

  const usingXAddress = shareValue !== account.address;

  return (
    <Screen>
      <Title>Receive</Title>
      <Note>{state.network.label}</Note>
      {shareValue ? (
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <QRCode
            value={shareValue}
            size={220}
            backgroundColor={colors.surface}
            color={colors.ink}
          />
        </Card>
      ) : null}
      <Text selectable style={{ fontVariant: ['tabular-nums'], color: colors.ink, fontSize: 14 }}>
        {shareValue}
      </Text>
      <Button
        label="Copy address"
        variant="secondary"
        disabled={!shareValue}
        onPress={() => {
          if (shareValue) void copyText(shareValue);
        }}
      />
      <Button
        label={`View on ${state.network.label} explorer`}
        variant="ghost"
        onPress={() => {
          const url = explorerAccountUrl(state.network, account.address);
          if (url) openExternal(url);
        }}
      />
      <Field
        label="Destination tag (optional)"
        keyboardType="number-pad"
        value={tag}
        onChangeText={setTag}
        error={receive.error ?? undefined}
        hint={
          usingXAddress
            ? 'The code above is an X-address with the tag built in, so it cannot be dropped in transit.'
            : 'Leave blank unless someone asked you for a tag.'
        }
      />
      {state.network.isTest ? (
        <Callout tone="caution" title={`${state.network.label} address`}>
          This address only works on {state.network.label}. Assets sent from Mainnet will not
          arrive.
        </Callout>
      ) : null}
      <Button label="Done" onPress={() => router.back()} />
    </Screen>
  );
}
