import { useEffect, useState } from 'react';
import { shortenAddress } from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { useAsyncAction } from '../store';
import { joeyProvider } from '../external/joey';
import { Button, Callout, Dialog } from '../components/primitives';
import { JoeyMark } from '../components/icons';

/**
 * Connects a wallet the user already keeps in Joey.
 *
 * Only the public address crosses over. Joey keeps the key, shows its own
 * approval screen for every transaction, and Ledgerly's keyring refuses to
 * sign for these wallets at all.
 */
export function ConnectWalletDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { wallet, store, state, openExternal } = useWallet();
  const [available, setAvailable] = useState(false);
  const [addresses, setAddresses] = useState<readonly string[] | null>(null);
  const [added, setAdded] = useState(0);

  useEffect(() => {
    setAvailable(joeyProvider.isAvailable());
  }, []);

  const known = new Set(state.accounts.map((account) => account.address));

  const connect = useAsyncAction(async () => {
    const granted = await joeyProvider.connect();
    setAddresses(granted);
  });

  const add = useAsyncAction(async () => {
    const granted = addresses ?? [];
    let count = 0;
    for (const address of granted) {
      if (known.has(address)) continue;
      await wallet.connectExternalAccount({ provider: 'joey', address });
      count += 1;
    }
    if (count === 0) {
      throw new Error('Those Joey wallets are already in this app.');
    }
    setAdded(count);
    await store.refresh();
  });

  if (added > 0) {
    return (
      <Dialog title="Joey connected" eyebrow="Outside wallet" onClose={onDone}>
        <Callout tone="positive">
          {added === 1
            ? 'That Joey wallet now shows up with your others.'
            : `${added} Joey wallets now show up with your others.`}
        </Callout>
        <p className="inline-note">
          Joey still holds the keys. Every payment from these wallets is approved in Joey, and
          Ledgerly never sees a phrase or a seed for them.
        </p>
        <Button variant="primary" block style={{ marginTop: 8 }} onClick={onDone}>
          Done
        </Button>
      </Dialog>
    );
  }

  return (
    <Dialog title="Connect Joey" eyebrow="Outside wallet" onClose={onClose}>
      <p className="inline-note">
        Joey keeps your keys and approves every payment. Ledgerly only reads the address, so you can
        watch and spend from it next to your other wallets.
      </p>

      {!available ? (
        <>
          <Callout tone="caution">Joey is not installed in this browser.</Callout>
          <Button variant="secondary" block onClick={() => openExternal(joeyProvider.installUrl)}>
            Get Joey
          </Button>
        </>
      ) : addresses === null ? (
        <>
          {connect.error ? <Callout tone="danger">{connect.error}</Callout> : null}
          <Button
            variant="accent"
            block
            style={{ marginTop: 8 }}
            loading={connect.pending}
            onClick={() => void connect.run().catch(() => undefined)}
          >
            <JoeyMark aria-hidden="true" /> Connect with Joey
          </Button>
        </>
      ) : (
        <>
          <div className="stack" style={{ gap: 8 }}>
            {addresses.map((address) => (
              <div className="row" key={address}>
                <div className="row-main">
                  <strong className="mono">{shortenAddress(address, 10, 6)}</strong>
                  <span className="backup-line">
                    {known.has(address) ? 'Already added' : 'Ready to add'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {add.error ? <Callout tone="danger">{add.error}</Callout> : null}
          <Button
            variant="accent"
            block
            style={{ marginTop: 8 }}
            loading={add.pending}
            onClick={() => void add.run().catch(() => undefined)}
          >
            <JoeyMark aria-hidden="true" /> Add to Ledgerly
          </Button>
        </>
      )}
    </Dialog>
  );
}
