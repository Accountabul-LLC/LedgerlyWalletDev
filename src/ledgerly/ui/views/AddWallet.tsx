import { useState } from 'react';
import { useWallet } from '../context';
import { Button, Panel } from '../components/primitives';
import { JoeyMark } from '../components/icons';
import { AddAccountDialog, ImportAccountDialog, NewPhraseAccountDialog } from './AccountDialogs';
import { ConnectWalletDialog } from './ConnectWalletDialog';

type Choice = 'add' | 'ownPhrase' | 'import' | 'connect' | null;

/**
 * A real page for the three ways to get another wallet, so the flow is
 * linkable and not buried in the switcher dropdown.
 */
export function AddWallet({ onDone }: { onDone?: () => void }) {
  const { store } = useWallet();
  const [choice, setChoice] = useState<Choice>(null);

  const close = () => setChoice(null);
  const done = () => {
    setChoice(null);
    void store.refresh();
    onDone?.();
  };

  return (
    <div className="stack">
      <div>
        <h2>Add a wallet</h2>
        <p className="inline-note" style={{ marginTop: 8 }}>
          Every option below either creates keys on this device only or connects a wallet you
          already have. Nothing is uploaded and no server ever sees your recovery phrase.
        </p>
      </div>

      <Panel eyebrow="Recommended" title="New wallet from your existing phrase">
        <p className="inline-note">
          Adds another address covered by the recovery phrase you already wrote down, so there is
          nothing new to back up.
        </p>
        <Button variant="accent" block style={{ marginTop: 12 }} onClick={() => setChoice('add')}>
          Create a wallet
        </Button>
      </Panel>

      <Panel eyebrow="Separate backup" title="New wallet with its own phrase">
        <p className="inline-note">
          Generates a fresh 24 word phrase for a wallet you want kept apart from the rest. You have
          to write this phrase down as well.
        </p>
        <Button
          variant="secondary"
          block
          style={{ marginTop: 12 }}
          onClick={() => setChoice('ownPhrase')}
        >
          Create with a new phrase
        </Button>
      </Panel>

      <Panel eyebrow="Bring your own" title="Import an existing wallet">
        <p className="inline-note">
          Restore a wallet from its 12 or 24 word recovery phrase, or from an XRPL family seed.
          Imported wallets keep their own secret and are not covered by the phrase you already
          saved.
        </p>
        <Button
          variant="secondary"
          block
          style={{ marginTop: 12 }}
          onClick={() => setChoice('import')}
        >
          Import a wallet
        </Button>
      </Panel>

      <Panel eyebrow="Already have one" title="Connect your Joey wallet">
        <p className="inline-note">
          Watch and spend from a wallet you keep in Joey, right next to the rest. Joey holds the
          keys and approves every payment, so nothing secret comes across.
        </p>
        <Button
          variant="secondary"
          block
          style={{ marginTop: 12 }}
          onClick={() => setChoice('connect')}
        >
          <JoeyMark aria-hidden="true" /> Connect Joey
        </Button>
      </Panel>

      {choice === 'connect' ? <ConnectWalletDialog onClose={close} onDone={done} /> : null}
      {choice === 'add' ? <AddAccountDialog onClose={close} onDone={done} /> : null}
      {choice === 'ownPhrase' ? <NewPhraseAccountDialog onClose={close} onDone={done} /> : null}
      {choice === 'import' ? <ImportAccountDialog onClose={close} onDone={done} /> : null}
    </div>
  );
}
