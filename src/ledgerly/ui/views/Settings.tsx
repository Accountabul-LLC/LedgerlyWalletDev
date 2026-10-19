import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { deleteProfile } from '@/lib/profile.functions';
import { displayOrigin, shortenAddress, type AccountSecretExport } from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { useAsyncAction, useAsyncData } from '../store';
import {
  Button,
  Callout,
  CopyButton,
  DetailList,
  Dialog,
  DocLink,
  EmptyState,
  Panel,
  SelectField,
  TextField,
} from '../components/primitives';
import {
  JoeyMark,
  LockIcon,
  PencilIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
} from '../components/icons';
import { XRPL_DOCS } from '../docs';
import { AUDIT_TOTALS, LATEST_REPORT, formatReportDate } from '@/lib/security-audit';
import { SyncPanel } from './SyncPanel';
import { broadcastSession, signOutEverywhere } from '../session';
import { forgetAllWalletLabels, forgetWalletLabels } from '../cloud/sync';
import { forgetAllNames, rememberName } from '../name-memory';

import {
  AddAccountDialog,
  ImportAccountDialog,
  NewPhraseAccountDialog,
  RenameAccountDialog,
  backupLabel,
} from './AccountDialogs';
import { ConnectWalletDialog } from './ConnectWalletDialog';
import { joeyProvider } from '../external/joey';

type Modal =
  | { kind: 'addAccount' }
  | { kind: 'ownPhraseAccount' }
  | { kind: 'importAccount' }
  | { kind: 'connectExternal' }
  | { kind: 'rename'; accountId: string }
  | { kind: 'revealSecret'; accountId: string }
  | { kind: 'removeWallet'; accountId: string }
  | { kind: 'changePassword' }
  | { kind: 'customNetwork' }
  | { kind: 'reset' }
  | { kind: 'deleteProfile' }
  | { kind: 'security' };

export function Settings() {
  const { wallet, store, state, surface } = useWallet();
  const [modal, setModal] = useState<Modal | null>(null);
  const [networkChoice, setNetworkChoice] = useState<{ id: string; hideTests: boolean } | null>(
    null,
  );
  const chosenNetwork = state.networks.find((network) => network.id === networkChoice?.id);
  const networkAction = useAsyncAction(async () => {
    if (!networkChoice) return;
    broadcastSession('invalidate');
    await wallet.setNetwork({ networkId: networkChoice.id });
    if (networkChoice.hideTests) await wallet.setPreferences({ showTestNetworks: false });
    await store.refresh();
    setNetworkChoice(null);
  });
  const preferenceAction = useAsyncAction(async (showTestNetworks: boolean) => {
    await wallet.setPreferences({ showTestNetworks });
    await store.refresh();
  });
  const permissions = useAsyncData(() => wallet.listPermissions(), []);

  const close = () => setModal(null);
  const refresh = () => {
    void store.refresh();
    permissions.reload();
    close();
  };

  // Only a family seed import is recovered by a family seed; everything else
  // is recovered by a 24 word phrase, so the labels follow the wallet.
  const activeAccount = state.accounts.find((account) => account.id === state.activeAccountId);
  const activeBackup = activeAccount?.backup;
  const activeIsExternal = Boolean(activeAccount?.external);

  return (
    <div className="stack">
      {surface === 'popup' ? (
        <Panel eyebrow="Profile" title="Ledgerly on the web">
          <p className="inline-note">
            Wallet names and payees can follow you across devices when you save them to a profile on
            the Ledgerly website. Your keys always stay in this browser.
          </p>
          <a
            className="button button--ghost"
            style={{ marginTop: 12, display: 'inline-flex' }}
            href="https://ledgerlywallet.com/auth"
            target="_blank"
            rel="noreferrer"
          >
            Open ledgerlywallet.com
          </a>
        </Panel>
      ) : null}
      <Panel
        eyebrow="Wallet"
        title="Accounts"
        action={
          <button
            className="icon-button"
            aria-label="Add account"
            onClick={() => setModal({ kind: 'addAccount' })}
          >
            <PlusIcon />
          </button>
        }
      >
        {state.accounts.map((account) => (
          <div className="row" key={account.id}>
            <span className="row-badge" title={account.external ? 'Joey wallet' : undefined}>
              {account.external ? (
                <JoeyMark aria-hidden="true" />
              ) : account.isImported ? (
                'IMP'
              ) : (
                `#${(account.derivationIndex ?? 0) + 1}`
              )}
            </span>
            <div className="row-main">
              <strong>{account.label}</strong>
              <span className="mono">{shortenAddress(account.address, 10, 6)}</span>
              <span className="backup-line">{backupLabel(account.backup)}</span>
            </div>
            <button
              className="icon-button"
              aria-label={`Change name for ${account.label}`}
              title="Change account name"
              onClick={() => setModal({ kind: 'rename', accountId: account.id })}
            >
              <PencilIcon />
            </button>
            {account.external ? null : (
              <button
                className="icon-button"
                aria-label={
                  account.backup === 'imported'
                    ? `Reveal family seed for ${account.label}`
                    : `Reveal recovery phrase for ${account.label}`
                }
                title={
                  account.backup === 'imported' ? 'Reveal family seed' : 'Reveal recovery phrase'
                }
                onClick={() => setModal({ kind: 'revealSecret', accountId: account.id })}
              >
                <ShieldIcon />
              </button>
            )}
            {state.accounts.length > 1 ? (
              <button
                className="icon-button"
                aria-label={`Remove ${account.label} from this device`}
                title="Remove this wallet from this device"
                onClick={() => setModal({ kind: 'removeWallet', accountId: account.id })}
              >
                <TrashIcon />
              </button>
            ) : null}
            <CopyButton value={account.address} label={`Copy ${account.label} address`} />
          </div>
        ))}

        <div className="button-row">
          <Button variant="secondary" onClick={() => setModal({ kind: 'ownPhraseAccount' })}>
            New wallet, own phrase
          </Button>
          <Button variant="secondary" onClick={() => setModal({ kind: 'importAccount' })}>
            Import a secret
          </Button>
          <Button variant="secondary" onClick={() => setModal({ kind: 'connectExternal' })}>
            <JoeyMark aria-hidden="true" /> Connect Joey
          </Button>
        </div>
      </Panel>

      <Panel eyebrow="Connection" title="Network">
        <SelectField
          label="Active network"
          value={state.network.id}
          disabled={networkAction.pending || preferenceAction.pending}
          onChange={(event) => {
            networkAction.clearError();
            setNetworkChoice({ id: event.target.value, hideTests: false });
          }}
        >
          {state.networks.map((network) => (
            <option key={network.id} value={network.id}>
              {network.label}
              {network.isTest ? ' (test)' : ''}
            </option>
          ))}
        </SelectField>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={state.preferences.showTestNetworks}
            disabled={networkAction.pending || preferenceAction.pending}
            onChange={(event) => {
              const show = event.target.checked;
              if (
                !show &&
                state.network.isTest &&
                ['testnet', 'devnet'].includes(state.network.id)
              ) {
                networkAction.clearError();
                setNetworkChoice({ id: 'mainnet', hideTests: true });
              } else {
                void preferenceAction.run(show).catch(() => undefined);
              }
            }}
          />
          Show test networks
        </label>

        {preferenceAction.error ? (
          <p className="field-error" role="alert">
            {preferenceAction.error}
          </p>
        ) : null}
        {chosenNetwork ? (
          <Dialog
            eyebrow="Switch network"
            title={`Switch to ${chosenNetwork.label}?`}
            onClose={() => {
              if (!networkAction.pending) setNetworkChoice(null);
            }}
          >
            <p>
              {chosenNetwork.isTest
                ? 'Funds on this network are for testing only.'
                : 'This is a live network. Balances are real money and transactions cannot be reversed.'}
            </p>
            {networkAction.error ? (
              <p className="field-error" role="alert">
                {networkAction.error}
              </p>
            ) : null}
            <div className="button-row">
              <Button
                variant="secondary"
                disabled={networkAction.pending}
                onClick={() => setNetworkChoice(null)}
              >
                Cancel
              </Button>
              <Button
                loading={networkAction.pending}
                onClick={() => void networkAction.run().catch(() => undefined)}
              >
                Switch to {chosenNetwork.label}
              </Button>
            </div>
          </Dialog>
        ) : null}
        <div className="button-row">
          <Button variant="secondary" onClick={() => setModal({ kind: 'customNetwork' })}>
            Add a custom endpoint
          </Button>
        </div>

        {state.networks
          .filter((network) => network.id.startsWith('custom:'))
          .map((network) => (
            <div className="row" key={network.id}>
              <div className="row-main">
                <strong>{network.label}</strong>
                <span className="mono">{network.endpoint}</span>
              </div>
              <button
                className="icon-button"
                aria-label={`Remove ${network.label}`}
                onClick={() => {
                  void wallet
                    .removeCustomNetwork({ networkId: network.id })
                    .then(() => store.refresh());
                }}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
      </Panel>

      <Panel eyebrow="Protection" title="Security">
        <SelectField
          label="Lock automatically after"
          value={String(state.preferences.autoLockMinutes)}
          onChange={(event) => {
            void wallet
              .setPreferences({ autoLockMinutes: Number(event.target.value) })
              .then(() => store.refresh());
          }}
        >
          {[1, 5, 15, 30, 60, 240].map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hours`}
            </option>
          ))}
        </SelectField>

        <SecurityAuditSummary />

        <div className="button-row" style={{ flexDirection: 'column' }}>
          <Button variant="secondary" block onClick={() => setModal({ kind: 'security' })}>
            <ShieldIcon /> How Ledgerly protects your keys
          </Button>
          <Button variant="secondary" block onClick={() => setModal({ kind: 'changePassword' })}>
            Change password
          </Button>
          {activeIsExternal ? null : (
            <Button
              variant="secondary"
              block
              disabled={!state.activeAccountId}
              onClick={() => {
                if (state.activeAccountId) {
                  setModal({ kind: 'revealSecret', accountId: state.activeAccountId });
                }
              }}
            >
              {activeBackup === 'imported'
                ? 'Reveal family seed for the open wallet'
                : 'Reveal recovery phrase for the open wallet'}
            </Button>
          )}
          <p className="inline-note">
            Reveal family seed only applies to a wallet you imported with an XRPL family seed, the
            single secret that starts with s. Every other wallet is recovered by a 24 word phrase,
            either the one this device was set up with or the wallet own phrase. Use the shield icon
            next to any wallet above to see that wallet.
          </p>
        </div>
      </Panel>

      <SessionPanel onDeleteProfile={() => setModal({ kind: 'deleteProfile' })} />

      <SyncPanel />

      <Panel eyebrow="Access" title="Connected sites">
        {permissions.data && permissions.data.length > 0 ? (
          permissions.data.map((permission) => (
            <div className="row" key={permission.origin}>
              <div className="row-main">
                <strong>{displayOrigin(permission.origin)}</strong>
                <span>
                  {permission.accountIds.length} account
                  {permission.accountIds.length === 1 ? '' : 's'} shared
                </span>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  void wallet
                    .revokePermission({ origin: permission.origin })
                    .then(() => permissions.reload());
                }}
              >
                Revoke
              </Button>
            </div>
          ))
        ) : (
          <EmptyState>No websites have access to this wallet.</EmptyState>
        )}
      </Panel>

      <Panel eyebrow="Danger zone" title="Erase all wallets from this device">
        <p className="inline-note">
          Deletes the encrypted vault, the signing keys and anything staged for signing in this
          browser, and locks every open Ledgerly tab. Your profile sign in is separate and is left
          alone. Recovery afterwards needs the phrases and family seeds you kept yourself.
        </p>
        <Button
          variant="danger"
          block
          style={{ marginTop: 12 }}
          onClick={() => setModal({ kind: 'reset' })}
        >
          Erase this wallet
        </Button>
      </Panel>

      {modal ? <SettingsModal modal={modal} onClose={close} onDone={refresh} /> : null}
    </div>
  );
}

function SettingsModal({
  modal,
  onClose,
  onDone,
}: {
  modal: Modal;
  onClose: () => void;
  onDone: () => void;
}) {
  switch (modal.kind) {
    case 'addAccount':
      return <AddAccountDialog onClose={onClose} onDone={onDone} />;
    case 'ownPhraseAccount':
      return <NewPhraseAccountDialog onClose={onClose} onDone={onDone} />;
    case 'importAccount':
      return <ImportAccountDialog onClose={onClose} onDone={onDone} />;
    case 'connectExternal':
      return <ConnectWalletDialog onClose={onClose} onDone={onDone} />;
    case 'rename':
      return (
        <RenameAccountDialog
          accountId={modal.accountId}
          allowRemove
          onClose={onClose}
          onDone={onDone}
        />
      );
    case 'revealSecret':
      return <AccountSecretDialog accountId={modal.accountId} onClose={onClose} />;
    case 'removeWallet':
      return <RemoveWalletDialog accountId={modal.accountId} onClose={onClose} onDone={onDone} />;

    case 'changePassword':
      return <ChangePasswordDialog onClose={onClose} onDone={onDone} />;
    case 'customNetwork':
      return <CustomNetworkDialog onClose={onClose} onDone={onDone} />;
    case 'reset':
      return <ResetDialog onClose={onClose} onDone={onDone} />;
    case 'deleteProfile':
      return <DeleteProfileDialog onClose={onClose} onDone={onDone} />;
    case 'security':
      return <SecurityNoteDialog onClose={onClose} />;
  }
}

/**
 * Removing one wallet from this device, without touching the others.
 *
 * A wallet that carries its own secret takes it with it, so the dialog makes
 * you export first and say out loud that you have it saved. The synced name is
 * deleted at the same time, so the profile dashboard stops listing a wallet
 * this device can no longer open.
 */
function RemoveWalletDialog({
  accountId,
  onClose,
  onDone,
}: {
  accountId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { wallet, store, state } = useWallet();
  const account = state.accounts.find((candidate) => candidate.id === accountId);
  const isExternal = Boolean(account?.external);
  // A connected outside wallet keeps its key in that app, so disconnecting it
  // here loses nothing and needs no acknowledgement.
  const holdsOwnSecret = account ? !isExternal && account.backup !== 'sharedPhrase' : false;
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  const remove = useAsyncAction(async () => {
    if (!account) throw new Error('That wallet is no longer on this device.');
    // Keep the name next to the address before the wallet goes, so recovering
    // this same wallet later comes back under the name it already had.
    rememberName(account.address, account.label);
    if (isExternal) await joeyProvider.disconnect();
    await wallet.removeAccount({ accountId, acknowledged });
    await forgetWalletLabels([account.address]).catch(() => undefined);
    await store.refresh();
    broadcastSession('invalidate');
    onDone();
  });

  const ready = confirmation === 'REMOVE' && (!holdsOwnSecret || acknowledged);

  return (
    <Dialog
      eyebrow={account?.label}
      title={isExternal ? 'Disconnect this wallet' : 'Remove this wallet from this device'}
      onClose={onClose}
    >
      <Callout
        tone={holdsOwnSecret ? 'danger' : 'caution'}
        title={
          isExternal
            ? 'Joey still has this wallet'
            : holdsOwnSecret
              ? 'This wallet keeps its own secret'
              : 'Your recovery phrase brings this one back'
        }
      >
        {isExternal
          ? 'Ledgerly only ever held the address. Joey keeps the keys, so you can connect it again at any time.'
          : holdsOwnSecret
            ? 'Nothing else on this device can recreate it. Reveal and save its recovery material first, or the funds it holds become unreachable.'
            : 'It was derived from the recovery phrase this device was set up with, so adding a wallet again restores the same address.'}
      </Callout>

      {account ? (
        <div className="address-box" style={{ marginTop: 12 }}>
          <span className="mono">{account.address}</span>
          <CopyButton value={account.address} />
        </div>
      ) : null}

      <p className="inline-note">
        The XRPL account keeps existing on the ledger with whatever it holds. This only removes it
        from this browser, along with the name synced to your profile.
      </p>

      {holdsOwnSecret ? (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          I have saved this wallet own recovery material somewhere safe.
        </label>
      ) : null}

      <TextField
        label="Type REMOVE to confirm"
        value={confirmation}
        autoComplete="off"
        style={{ marginTop: 12 }}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {remove.error ? <Callout tone="danger">{remove.error}</Callout> : null}
      <Button
        variant="danger"
        block
        style={{ marginTop: 12 }}
        loading={remove.pending}
        disabled={!ready}
        onClick={() => void remove.run().catch(() => undefined)}
      >
        {isExternal ? 'Disconnect wallet' : 'Remove wallet'}
      </Button>
    </Dialog>
  );
}

function ChangePasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { wallet } = useWallet();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const change = useAsyncAction(async () => {
    await wallet.changePassword({ current, next });
    onDone();
  });

  return (
    <Dialog title="Change password" onClose={onClose}>
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        error={confirm.length > 0 && confirm !== next ? 'Passwords do not match.' : null}
        onChange={(event) => setConfirm(event.target.value)}
      />
      {change.error ? <Callout tone="danger">{change.error}</Callout> : null}
      <Button
        variant="accent"
        block
        loading={change.pending}
        disabled={current === '' || next === '' || next !== confirm}
        onClick={() => void change.run().catch(() => undefined)}
      >
        Change password
      </Button>
    </Dialog>
  );
}

function CustomNetworkDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { wallet } = useWallet();
  const [label, setLabel] = useState('');
  const [endpoint, setEndpoint] = useState('wss://');
  const [networkId, setNetworkId] = useState('');

  const add = useAsyncAction(async () => {
    await wallet.addCustomNetwork({
      label: label.trim(),
      endpoint: endpoint.trim(),
      networkId: Number(networkId),
    });
    onDone();
  });

  return (
    <Dialog title="Custom endpoint" onClose={onClose}>
      <TextField label="Name" value={label} onChange={(event) => setLabel(event.target.value)} />
      <TextField
        label="WebSocket endpoint"
        placeholder="wss://…"
        spellCheck={false}
        value={endpoint}
        onChange={(event) => setEndpoint(event.target.value)}
        hint="Only wss:// is accepted. Ledgerly refuses to connect over an unencrypted socket."
      />
      <TextField
        label="Expected network ID"
        inputMode="numeric"
        value={networkId}
        onChange={(event) => setNetworkId(event.target.value.replace(/[^0-9]/g, ''))}
        hint="The wallet refuses to sign if the server reports a different ID."
      />
      {add.error ? <Callout tone="danger">{add.error}</Callout> : null}
      <Button
        variant="accent"
        block
        loading={add.pending}
        disabled={label.trim() === '' || networkId === ''}
        onClick={() => void add.run().catch(() => undefined)}
      >
        Add endpoint
      </Button>
    </Dialog>
  );
}

function ResetDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { wallet } = useWallet();
  const [confirmation, setConfirmation] = useState('');

  const reset = useAsyncAction(async () => {
    await wallet.resetWallet({ confirmation });
    // Nothing local is left, so the names synced to the profile would only be
    // ghosts of wallets this device can no longer open.
    await forgetAllWalletLabels().catch(() => undefined);
    forgetAllNames();
    broadcastSession('erase');
    onDone();
  });

  return (
    <Dialog title="Erase this wallet" onClose={onClose}>
      <Callout tone="danger" title="There is no undo">
        Without your recovery phrase written down, every account here becomes permanently
        unreachable.
      </Callout>
      <TextField
        label="Type ERASE to confirm"
        value={confirmation}
        autoComplete="off"
        style={{ marginTop: 12 }}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {reset.error ? <Callout tone="danger">{reset.error}</Callout> : null}
      <Button
        variant="danger"
        block
        loading={reset.pending}
        disabled={confirmation !== 'ERASE'}
        onClick={() => void reset.run().catch(() => undefined)}
      >
        Erase everything
      </Button>
    </Dialog>
  );
}

function SecurityNoteDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="How Ledgerly protects your keys" onClose={onClose}>
      <div className="stack" style={{ gap: 20 }}>
        <section>
          <strong>Your keys stay on your device</strong>
          <p className="inline-note" style={{ marginTop: 6 }}>
            Your wallet keys are generated directly on your device and encrypted locally using your
            password. Sensitive key operations take place inside an isolated Web Worker, and your
            private keys or recovery phrase are never intentionally uploaded to our servers.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            Only you can unlock your wallet.
          </p>
        </section>

        <section>
          <strong>Your recovery phrase</strong>
          <p className="inline-note" style={{ marginTop: 6 }}>
            Your 24-word recovery phrase is available only when you create your wallet or when you
            explicitly choose to reveal or export it after entering your password. We never store
            your recovery phrase.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            For added privacy, the phrase stays blurred until you select Reveal.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            You can also copy your recovery phrase when needed, but remember that anything copied to
            your clipboard may be accessible to other applications or browser extensions. For the
            safest backup, write your recovery phrase down and store it somewhere offline, private,
            and secure.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            Never share your recovery phrase with anyone. Anyone who has it can control your wallet.
          </p>
        </section>

        <section>
          <strong>Encryption and auto-lock</strong>
          <p className="inline-note" style={{ marginTop: 6 }}>
            Your wallet vault is encrypted using your password and a secure key-derivation process.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            Ledgerly automatically locks after your selected period of inactivity and locks when the
            wallet session is closed. Once locked, your password is required to regain access to
            your wallet and signing capabilities.
          </p>
        </section>

        <section>
          <strong>Built for safety</strong>
          <p className="inline-note" style={{ marginTop: 6 }}>
            Ledgerly is designed to minimize exposure of your private keys and recovery phrase.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            Sensitive wallet operations are isolated from the main interface wherever possible, and
            actions such as revealing your recovery phrase, exporting wallet credentials, or
            authorizing protected operations require authentication.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            Your password is an important layer of protection, but you should also keep your device,
            browser, and installed extensions secure.
          </p>
        </section>

        <section>
          <strong>Web app vs. browser extension</strong>
          <p className="inline-note" style={{ marginTop: 6 }}>
            The Ledgerly web wallet is designed with safeguards that limit access to sensitive
            wallet operations, including isolated key handling, restricted worker methods,
            password-protected exports, and authenticated signing.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            However, web applications operate within the security boundaries of the browser and
            webpage environment.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            For stronger isolation, the Ledgerly browser extension separates wallet functionality
            from ordinary website scripts and provides an additional layer of protection between
            your wallet and the websites you visit.
          </p>
          <p className="inline-note" style={{ marginTop: 6 }}>
            We believe wallet security should be transparent, so we clearly explain both the
            protections Ledgerly provides and the security boundaries of each version.
          </p>
        </section>

        <Button variant="primary" block onClick={onClose}>
          Got it
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * The five ways out of a session, kept apart on purpose. Locking, signing out
 * of a profile, removing one wallet, erasing this device and deleting the
 * profile do very different things, and treating any of them as an alias for
 * another is how people lose funds.
 */
function SessionPanel({ onDeleteProfile }: { onDeleteProfile: () => void }) {
  const { wallet, store, state } = useWallet();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  // One awaited flow, with its own pending and error states, so nobody is sent
  // to a page while the session is still being torn down.
  const signOut = useAsyncAction(async () => {
    await signOutEverywhere(() => wallet.lock());
    window.location.replace('/auth');
  });

  return (
    <Panel eyebrow="Session" title="Ending a session">
      <p className="inline-note">
        Your signing keys live in this browser only. Signing in to a profile proves who you are and
        carries wallet names, it does not recover keys on a new device. If you lose every phrase and
        family seed you saved, no one can restore those wallets for you.
      </p>

      <div className="row">
        <div className="row-main">
          <strong>Lock wallet</strong>
          <span>
            Clears the keys from memory in every Ledgerly tab and cancels anything waiting to be
            signed. Your vault and your profile stay. Your password unlocks it again.
          </span>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            broadcastSession('lock');
            void wallet.lock().then(() => store.refresh());
          }}
        >
          <LockIcon /> Lock now
        </Button>
      </div>

      {signedIn ? (
        <div className="row">
          <div className="row-main">
            <strong>Sign out of Ledgerly</strong>
            <span>
              Locks every tab first, then signs the profile out on this device. The encrypted vault
              stays here, so signing back in returns you to the unlock screen.
            </span>
          </div>
          <Button
            variant="secondary"
            loading={signOut.pending}
            onClick={() => {
              void signOut.run().catch(() => undefined);
            }}
          >
            {signOut.pending ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      ) : null}

      {signOut.error ? <Callout tone="danger">{signOut.error}</Callout> : null}

      <div className="row">
        <div className="row-main">
          <strong>Remove one wallet from this device</strong>
          <span>
            {state.accounts.length > 1
              ? 'Use the trash icon next to any wallet in Wallets above. The other wallets and your profile are untouched, and putting it back needs that wallet own phrase or family seed.'
              : 'Available once you have more than one wallet on this device.'}
          </span>
        </div>
      </div>

      <div className="row">
        <div className="row-main">
          <strong>Delete Ledgerly profile</strong>
          <span>
            An account and privacy action. It deletes your login and the names synced to it. Your
            XRPL accounts keep existing on the ledger and stay under your keys.
          </span>
        </div>
        <Button variant="ghost" disabled={!signedIn} onClick={onDeleteProfile}>
          Delete profile
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Export symmetry: whatever actually recreates this wallet, plus the exact
 * derivation inputs, so the same address can be reproduced in another tool.
 */
function AccountSecretDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { wallet, state } = useWallet();
  const account = state.accounts.find((candidate) => candidate.id === accountId);
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const material = useRef<AccountSecretExport | null>(null);

  useEffect(
    () => () => {
      material.current = null;
    },
    [],
  );

  const dismiss = () => {
    material.current = null;
    setShown(false);
    onClose();
  };

  const reveal = useAsyncAction(async () => {
    material.current = await wallet.exportAccountSecret({ password, accountId });
    setPassword('');
    setShown(true);
  });

  const revealed = shown ? material.current : null;

  return (
    <Dialog
      eyebrow={account?.label}
      title={
        revealed?.kind === 'familySeed' || account?.backup === 'imported'
          ? 'Reveal family seed'
          : 'Reveal recovery phrase'
      }
      onClose={dismiss}
    >
      {revealed ? (
        <>
          <Callout tone="danger" title="Anyone who sees this can take your funds">
            Never share it, never type it into a website, and never store it in a photo or cloud
            note.
            <DocLink href={XRPL_DOCS.keys}>Read about keys and accounts on XRPL.org</DocLink>
          </Callout>
          {revealed.kind === 'mnemonic' ? (
            <div className="seed-grid">
              {revealed.secret.split(' ').map((word, index) => (
                <div className="seed-word" key={index}>
                  <b>{index + 1}</b>
                  {word}
                </div>
              ))}
            </div>
          ) : (
            <div className="address-box">
              <span className="mono">{revealed.secret}</span>
            </div>
          )}
          <DetailList
            items={[
              {
                label: 'Secret format',
                value: revealed.kind === 'mnemonic' ? 'Recovery phrase' : 'XRPL family seed',
              },
              {
                label: 'Signing algorithm',
                value: <span className="mono">{revealed.algorithm}</span>,
              },
              ...(revealed.path
                ? [
                    {
                      label: 'Derivation path',
                      value: <span className="mono">{revealed.path}</span>,
                    },
                  ]
                : []),
              ...(revealed.index !== null
                ? [{ label: 'Account index', value: String(revealed.index) }]
                : []),
              {
                label: 'Expected address',
                value: <span className="mono">{revealed.address}</span>,
              },
            ]}
          />
          <p className="inline-note">
            Restoring this material in any XRPL wallet that uses the same algorithm and path must
            produce the address above. If it produces a different one, it is not this wallet.
          </p>
          <div className="button-row">
            <CopyButton
              getValue={() => material.current?.secret ?? ''}
              label={revealed.kind === 'familySeed' ? 'Copy family seed' : 'Copy phrase'}
            />
            <Button variant="primary" onClick={dismiss}>
              Done
            </Button>
          </div>
        </>
      ) : (
        <>
          <Callout tone="caution">
            {account?.backup === 'imported'
              ? 'This wallet was imported with an XRPL family seed, so a family seed is what recovers it. Confirm your password to show it, and make sure nobody can see your screen.'
              : 'This wallet is recovered by a 24 word phrase, not a family seed. Confirm your password to show it, and make sure nobody can see your screen.'}
          </Callout>
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            style={{ marginTop: 12 }}
            onChange={(event) => setPassword(event.target.value)}
          />
          {reveal.error ? <Callout tone="danger">{reveal.error}</Callout> : null}
          <Button
            variant="danger"
            block
            loading={reveal.pending}
            disabled={password.length === 0}
            onClick={() => void reveal.run().catch(() => undefined)}
          >
            {account?.backup === 'imported' ? 'Show family seed' : 'Show recovery phrase'}
          </Button>
        </>
      )}
    </Dialog>
  );
}

function DeleteProfileDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [confirmation, setConfirmation] = useState('');

  const remove = useAsyncAction(async () => {
    await deleteProfile();
    // The names this browser remembers belong to the profile that is going, so
    // they go with it.
    forgetAllNames();
    await supabase.auth.signOut();
    onDone();
  });

  return (
    <Dialog title="Delete Ledgerly profile" onClose={onClose}>
      <Callout tone="danger" title="This deletes your login, not your wallets">
        Your profile and the wallet names synced to it are removed for good. The wallets on this
        device stay exactly where they are, and your XRPL accounts keep existing on the ledger under
        your own keys.
      </Callout>
      <TextField
        label="Type DELETE to confirm"
        value={confirmation}
        autoComplete="off"
        style={{ marginTop: 12 }}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {remove.error ? <Callout tone="danger">{remove.error}</Callout> : null}
      <Button
        variant="danger"
        block
        loading={remove.pending}
        disabled={confirmation !== 'DELETE'}
        onClick={() => void remove.run().catch(() => undefined)}
      >
        Delete profile
      </Button>
    </Dialog>
  );
}

/**
 * The security audit at a glance, inside Settings, so the answer to "is this
 * thing actually safe" is one tap from the wallet rather than buried on the
 * marketing site. Numbers come from the published audit and the daily code
 * report, not from a hand-written claim.
 */
function SecurityAuditSummary() {
  const latest = LATEST_REPORT;
  return (
    <Callout tone="info" title="Security audit">
      <p className="inline-note">
        The last full audit ran {AUDIT_TOTALS.checks} checks across encryption, key isolation,
        recovery phrase handling, browser hardening, sessions and our backend boundary.{' '}
        {AUDIT_TOTALS.passed} passed, {AUDIT_TOTALS.fixed}{' '}
        {AUDIT_TOTALS.fixed === 1 ? 'was' : 'were'} fixed during the audit and {AUDIT_TOTALS.open}{' '}
        remain open. An independent third-party penetration test is still outstanding.
      </p>
      {latest ? (
        <p className="inline-note" style={{ marginTop: 6 }}>
          Daily code check on {formatReportDate(latest.date)}: {latest.headline} We watch{' '}
          {latest.filesWatched} files that decide whether your keys stay on this device.
        </p>
      ) : null}
      <p className="inline-note" style={{ marginTop: 6 }}>
        <a href="/security-center">Read the full report in the security center</a>
      </p>
    </Callout>
  );
}
