import { useState } from 'react';
import {
  isValidAddress,
  resolveDestination,
  shortenAddress,
  type Contact,
} from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { useAsyncAction, useAsyncData } from '../store';
import { Button, Callout, Dialog, EmptyState, Panel, TextField } from '../components/primitives';
import { PlusIcon, TrashIcon, UsersIcon } from '../components/icons';
import { initialsOf } from '../format';
import { findRecipients, parseRecipientTag, type RecipientSuggestion } from '../recipients';
import { RecipientSuggestions } from '../components/RecipientSuggestions';

export function Contacts() {
  const { wallet } = useWallet();
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const contacts = useAsyncData(() => wallet.listContacts(), []);

  return (
    <div className="stack">
      <Panel
        eyebrow="Address book"
        title="Contacts"
        action={
          <button
            className="icon-button"
            aria-label="Add contact"
            onClick={() => setEditing('new')}
          >
            <PlusIcon />
          </button>
        }
      >
        {contacts.data && contacts.data.length > 0 ? (
          contacts.data.map((contact) => (
            <div className="row" key={contact.id}>
              <span className="row-badge">{initialsOf(contact.label)}</span>
              <button
                className="row-main"
                style={{ border: 0, background: 'none', textAlign: 'left', padding: 0 }}
                onClick={() => setEditing(contact)}
              >
                <strong>{contact.label}</strong>
                <span>
                  {shortenAddress(contact.address)}
                  {contact.destinationTag !== undefined ? ` · tag ${contact.destinationTag}` : ''}
                </span>
              </button>
              <button
                className="icon-button"
                aria-label={`Remove ${contact.label}`}
                onClick={() => {
                  void wallet.removeContact({ id: contact.id }).then(() => contacts.reload());
                }}
              >
                <TrashIcon />
              </button>
            </div>
          ))
        ) : (
          <EmptyState>
            <UsersIcon style={{ width: 22, height: 22, opacity: 0.4 }} />
            <br />
            Save the addresses you send to often so you never paste the wrong one.
          </EmptyState>
        )}
      </Panel>

      {editing ? (
        <ContactDialog
          contact={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            contacts.reload();
          }}
        />
      ) : null}
    </div>
  );
}

export function ContactDialog({
  contact,
  defaultAddress,
  onClose,
  onSaved,
}: {
  contact: Contact | null;
  defaultAddress?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { wallet, state } = useWallet();
  const savedContacts = useAsyncData(() => wallet.listContacts(), []);
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState(contact?.label ?? '');
  const [address, setAddress] = useState(contact?.address ?? defaultAddress ?? '');
  const [tag, setTag] = useState(
    () =>
      contact?.destinationTag?.toString() ??
      (isValidAddress(address)
        ? resolveDestination(address).destinationTag?.toString()
        : undefined) ??
      '',
  );
  const [note, setNote] = useState(contact?.note ?? '');

  const suggestions = findRecipients(query, state.accounts, savedContacts.data ?? []);
  const addressValid = isValidAddress(address);
  let tagError: string | null = null;
  let boundTag = false;
  if (addressValid) boundTag = resolveDestination(address).tagIsBound;
  try {
    parseRecipientTag(tag);
  } catch (error) {
    tagError = (error as Error).message;
  }
  const choose = (recipient: RecipientSuggestion) => {
    setLabel(recipient.label);
    setAddress(recipient.address);
    setTag(recipient.destinationTag?.toString() ?? '');
    setNote(recipient.note ?? '');
    setQuery('');
  };
  const save = useAsyncAction(async () => {
    if (!addressValid) throw new Error('That is not a valid XRP Ledger address.');
    const parsedTag = parseRecipientTag(tag);
    await wallet.saveContact({
      ...(contact ? { id: contact.id } : {}),
      label: label.trim(),
      address: address.trim(),
      ...(parsedTag === undefined ? {} : { destinationTag: parsedTag }),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    onSaved();
  });

  return (
    <Dialog title={contact ? 'Edit contact' : 'New contact'} onClose={onClose}>
      <TextField
        label="Name"
        value={label}
        autoComplete="off"
        maxLength={40}
        hint="Type a wallet name to find your wallets and saved contacts."
        onChange={(event) => {
          setLabel(event.target.value);
          setQuery(event.target.value);
        }}
      />
      <RecipientSuggestions suggestions={query !== address ? suggestions : []} onPick={choose} />
      <TextField
        label="Address"
        placeholder="r… or X…"
        spellCheck={false}
        autoComplete="off"
        value={address}
        error={
          address.trim() && !addressValid
            ? 'Enter a valid XRP Ledger address or choose a matching wallet.'
            : null
        }
        onChange={(event) => {
          const value = event.target.value;
          setAddress(value);
          setQuery(value);
          const resolved = isValidAddress(value) ? resolveDestination(value) : null;
          setTag(resolved?.tagIsBound ? (resolved.destinationTag?.toString() ?? '') : '');
        }}
      />
      <RecipientSuggestions suggestions={query === address ? suggestions : []} onPick={choose} />
      <TextField
        label="Destination tag (optional)"
        inputMode="numeric"
        autoComplete="off"
        value={tag}
        readOnly={boundTag}
        error={tagError}
        onChange={(event) => setTag(event.target.value)}
        hint={
          boundTag
            ? 'The X-address supplies its tag; it cannot be overridden.'
            : 'Use the tag provided by the recipient. Leave blank if none is required.'
        }
      />
      <TextField
        label="Note (optional)"
        value={note}
        maxLength={200}
        hint="A contact note, separate from the public payment memo."
        onChange={(event) => setNote(event.target.value)}
      />

      {save.error ? <Callout tone="danger">{save.error}</Callout> : null}

      <Button
        variant="accent"
        block
        style={{ marginTop: 8 }}
        loading={save.pending}
        disabled={
          label.trim() === '' || label.trim().length > 40 || !addressValid || tagError !== null
        }
        onClick={() => void save.run().catch(() => undefined)}
      >
        Save contact
      </Button>
    </Dialog>
  );
}
