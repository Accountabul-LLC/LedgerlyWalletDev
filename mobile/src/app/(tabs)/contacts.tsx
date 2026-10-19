import { useEffect, useState } from 'react';
import { isValidAddress, shortenAddress, type Contact } from '@ledgerly/core/shared';
import { useWallet } from '../../wallet';
import { Button, Callout, Card, Field, Note, Row, Screen, Title } from '../../ui';
import { IconBadge } from '../../icons';
import { parseDestinationTag } from '../../../../src/ledgerly/native/destinationTag';

export default function ContactsScreen() {
  const { wallet } = useWallet();
  const [contacts, setContacts] = useState<readonly Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [tag, setTag] = useState('');
  const [pending, setPending] = useState(false);

  async function reload() {
    try {
      setContacts(await wallet.listContacts());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load contacts.');
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addressOk = address.trim().length === 0 || isValidAddress(address.trim());

  return (
    <Screen>
      <Title>Payees</Title>
      <Note>Save the addresses you send to often so you never paste the wrong one.</Note>
      {error ? <Callout tone="danger">{error}</Callout> : null}

      {(contacts ?? []).map((contact) => (
        <Card key={contact.id}>
          <Row
            leading={<IconBadge name="contacts" />}
            title={contact.label}
            subtitle={`${shortenAddress(contact.address)}${
              contact.destinationTag !== undefined ? ` · tag ${contact.destinationTag}` : ''
            }`}
          />
          <Button
            label="Remove"
            variant="ghost"
            onPress={() => {
              void wallet.removeContact({ id: contact.id }).then(() => reload());
            }}
          />
        </Card>
      ))}

      <Field label="Name" value={label} onChangeText={setLabel} />
      <Field
        label="Address"
        autoCapitalize="none"
        autoCorrect={false}
        value={address}
        onChangeText={setAddress}
        error={addressOk ? null : 'That is not a valid XRP Ledger address.'}
      />
      <Field
        label="Destination tag (optional)"
        keyboardType="number-pad"
        value={tag}
        onChangeText={setTag}
      />
      <Button
        label="Save payee"
        disabled={label.trim().length === 0 || !isValidAddress(address.trim())}
        loading={pending}
        onPress={() => {
          let destinationTag: number | undefined;
          try {
            destinationTag = parseDestinationTag(tag);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Invalid destination tag.');
            return;
          }
          setPending(true);
          void wallet
            .saveContact({
              label: label.trim(),
              address: address.trim(),
              ...(destinationTag === undefined ? {} : { destinationTag }),
            })
            .then(() => {
              setLabel('');
              setAddress('');
              setTag('');
              return reload();
            })
            .catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : 'Could not save.');
            })
            .finally(() => setPending(false));
        }}
      />
    </Screen>
  );
}
