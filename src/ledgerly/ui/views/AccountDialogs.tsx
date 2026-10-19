import { useEffect, useRef, useState } from 'react';
import { recallWalletName } from '../cloud/sync';
import { shortenAddress, type AccountBackupKind, type ImportPreview } from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { useAsyncAction, useAsyncData } from '../store';
import { recordPlatformEvent } from '../metrics';
import {
  Button,
  Callout,
  CopyButton,
  DetailList,
  Dialog,
  TextAreaField,
  TextField,
} from '../components/primitives';

/** How long a previewed address stays claimable before it has to be re-derived. */
const PREVIEW_SECONDS = 60;

/**
 * Shared by Settings and the wallet switcher in the top bar, so adding a
 * wallet reads the same wherever it is started from.
 *
 * Two steps on purpose: naming a wallet and seeing the exact address it will
 * get are different decisions, and the old single button made a real new
 * wallet look like a cosmetic label change.
 */
export function AddAccountDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { wallet, state } = useWallet();
  const [label, setLabel] = useState('');
  const [step, setStep] = useState<'name' | 'confirm'>('name');
  const [expired, setExpired] = useState(false);

  const preview = useAsyncData(
    () => (step === 'confirm' ? wallet.previewNextAccount() : Promise.resolve(null)),
    [step],
  );

  const add = useAsyncAction(async () => {
    const address = preview.data?.address;
    if (!address) throw new Error('No address to claim yet.');
    await wallet.addAccount({
      expectedAddress: address,
      ...(label.trim() ? { label: label.trim() } : {}),
    });
    recordPlatformEvent('wallet_created', state.network.id, address);
    onDone();
  });

  if (step === 'name') {
    return (
      <Dialog title="Add a wallet" onClose={onClose}>
        <p className="inline-note">
          This creates a new wallet with its own address and its own signing key. It is covered by
          the recovery phrase you already saved, so there is nothing new to write down.
        </p>
        <TextField
          label="Name (optional)"
          placeholder="Savings"
          value={label}
          style={{ marginTop: 12 }}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Button
          variant="accent"
          block
          onClick={() => {
            setExpired(false);
            setStep('confirm');
          }}
        >
          Preview the address
        </Button>
      </Dialog>
    );
  }

  return (
    <Dialog title="Claim this address" onClose={onClose}>
      {preview.error ? <Callout tone="danger">{preview.error}</Callout> : null}
      {preview.data ? (
        <>
          <div className="preview-address">
            <span className="preview-address-label">
              New address, slot #{preview.data.index + 1}
            </span>
            <strong className="mono">{preview.data.address}</strong>
            <span className="inline-note">{shortenAddress(preview.data.address, 10, 6)}</span>
            <CopyButton value={preview.data.address} label="Copy new address" />
          </div>

          {expired ? (
            <Callout tone="caution" title="This preview timed out">
              Take another look and claim it when you are ready.
            </Callout>
          ) : (
            <ClaimCountdown key={preview.data.address} onExpire={() => setExpired(true)} />
          )}

          <p className="inline-note">
            Backed up by your saved recovery phrase. No new phrase exists for this wallet.
          </p>
        </>
      ) : (
        <p className="inline-note">Deriving the next address…</p>
      )}

      {add.error ? <Callout tone="danger">{add.error}</Callout> : null}
      <div className="button-row">
        <Button
          variant="secondary"
          onClick={() => {
            setExpired(false);
            setStep('name');
          }}
        >
          Back
        </Button>
        {expired ? (
          <Button
            variant="accent"
            onClick={() => {
              setExpired(false);
              preview.reload();
            }}
          >
            Show it again
          </Button>
        ) : (
          <Button
            variant="accent"
            loading={add.pending}
            disabled={!preview.data}
            onClick={() => void add.run().catch(() => undefined)}
          >
            Create this wallet
          </Button>
        )}
      </div>
    </Dialog>
  );
}

function ClaimCountdown({ onExpire }: { onExpire: () => void }) {
  const [left, setLeft] = useState(PREVIEW_SECONDS);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          onExpire();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [onExpire]);

  const minutes = Math.floor(left / 60);
  const seconds = `${left % 60}`.padStart(2, '0');

  return (
    <div className="claim-countdown" role="timer" aria-live="off">
      <span className="claim-countdown-dot" aria-hidden />
      Claim within {minutes}:{seconds}
    </div>
  );
}

/**
 * What the confirm step is given instead of the phrase: positions plus a salted
 * digest of each expected word. Enough to grade an answer; not the words.
 */
type Challenge = { positions: number[]; salt: string; digests: string[] };

/**
 * The phrase is passed around in this mutable box rather than in React state or
 * props. React keeps old props and state reachable through retained fibers long
 * after a screen is gone; a box can be emptied, and every holder sees empty.
 */
type PhraseBox = { value: string | null };

/**
 * A wallet with its own 24 words, for people who want one that the main phrase
 * cannot restore. Same backup and verify steps as first time setup, because
 * losing these words loses this wallet on its own.
 *
 * The vault write happens before the backup screen, the same way first-time
 * setup writes the vault before the words are shown. That lets this dialog drop
 * the phrase from the page at confirm and only put it back behind the password.
 */
export function NewPhraseAccountDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { wallet, state } = useWallet();
  const [label, setLabel] = useState('');
  const [step, setStep] = useState<'intro' | 'backup' | 'verify' | 'reveal'>('intro');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const phrase = useRef<PhraseBox>({ value: null });
  const created = useRef(false);

  useEffect(
    () => () => {
      phrase.current.value = null;
    },
    [],
  );

  const dismiss = () => {
    phrase.current.value = null;
    if (created.current) onDone();
    else onClose();
  };

  const start = useAsyncAction(async () => {
    const generated = await wallet.generateRecoveryPhrase();
    phrase.current.value = generated.mnemonic;
    try {
      const account = await wallet.addAccountWithOwnPhrase({
        mnemonic: generated.mnemonic,
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      created.current = true;
      setAccountId(account.id);
      recordPlatformEvent('wallet_created', state.network.id, account.address);
      setStep('backup');
    } catch (error) {
      phrase.current.value = null;
      throw error;
    }
  });

  if (step === 'intro') {
    return (
      <Dialog title="Wallet with its own phrase" onClose={dismiss}>
        <Callout tone="caution" title="A separate backup to keep">
          This wallet is not covered by the phrase you already saved. Continuing creates it on this
          device, then shows 24 words of its own. Those words are the only way to restore it.
        </Callout>
        <TextField
          label="Name (optional)"
          placeholder="Separate wallet"
          value={label}
          style={{ marginTop: 12 }}
          onChange={(event) => setLabel(event.target.value)}
        />
        {start.error ? <Callout tone="danger">{start.error}</Callout> : null}
        <Button
          variant="accent"
          block
          loading={start.pending}
          onClick={() => void start.run().catch(() => undefined)}
        >
          Show me the phrase
        </Button>
      </Dialog>
    );
  }

  if (step === 'backup') {
    return (
      <OwnPhraseBackupStep
        phrase={phrase.current}
        onClose={dismiss}
        onContinue={(next) => {
          setChallenge(next);
          setStep('verify');
        }}
      />
    );
  }

  if (step === 'reveal' && accountId) {
    return (
      <OwnPhraseRevealStep
        accountId={accountId}
        onClose={dismiss}
        onRevealed={(mnemonic) => {
          phrase.current.value = mnemonic;
          setStep('backup');
        }}
      />
    );
  }

  if (step === 'verify' && challenge) {
    return (
      <OwnPhraseVerifyStep
        challenge={challenge}
        onClose={dismiss}
        onBack={() => setStep('reveal')}
        onFinish={onDone}
      />
    );
  }

  return (
    <OwnPhraseBackupStep
      phrase={phrase.current}
      onClose={dismiss}
      onContinue={(next) => {
        setChallenge(next);
        setStep('verify');
      }}
    />
  );
}

function OwnPhraseBackupStep({
  phrase,
  onContinue,
  onClose,
}: {
  phrase: PhraseBox;
  onContinue: (challenge: Challenge) => void;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const words = useRef<string[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    words.current = (phrase.value ?? '').split(' ').filter(Boolean);
    setTick((value) => value + 1);
    return () => {
      words.current.fill('');
      words.current.length = 0;
    };
  }, [phrase]);

  const advance = useAsyncAction(async () => {
    const next = await buildChallenge(words.current);
    words.current.fill('');
    words.current.length = 0;
    phrase.value = null;
    setRevealed(false);
    onContinue(next);
  });

  return (
    <Dialog title="Write this down" onClose={onClose}>
      <p className="inline-note">
        These 24 words restore this wallet on any XRPL wallet app. Keep them off screens and out of
        cloud storage.
      </p>
      <div className={`seed-grid ${revealed ? '' : 'blurred'}`} aria-hidden={!revealed}>
        {words.current.map((_, index) => (
          <div className="seed-word" key={index}>
            <b>{index + 1}</b>
            {revealed ? words.current[index] : null}
          </div>
        ))}
      </div>
      {revealed ? (
        <div className="button-row" style={{ marginTop: 0 }}>
          <Button variant="secondary" onClick={() => setRevealed(false)}>
            Hide
          </Button>
          <CopyButton getValue={() => phrase.value ?? ''} label="Copy recovery phrase" />
        </div>
      ) : (
        <Button
          variant="secondary"
          block
          disabled={words.current.length === 0}
          onClick={() => setRevealed(true)}
        >
          Reveal phrase
        </Button>
      )}
      <Button
        variant="accent"
        block
        disabled={!revealed}
        loading={advance.pending}
        onClick={() => void advance.run().catch(() => undefined)}
      >
        I have written it down
      </Button>
    </Dialog>
  );
}

function OwnPhraseVerifyStep({
  challenge,
  onBack,
  onFinish,
  onClose,
}: {
  challenge: Challenge;
  onBack: () => void;
  onFinish: () => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const finish = useAsyncAction(async () => {
    const given = await Promise.all(
      challenge.positions.map((position) =>
        digestWord(challenge.salt, (answers[position] ?? '').trim().toLowerCase()),
      ),
    );
    if (given.some((digest, index) => digest !== challenge.digests[index])) {
      setError('Those words do not match. Check your written copy and try again.');
      return;
    }
    onFinish();
  });

  return (
    <Dialog title="Confirm the phrase" onClose={onClose}>
      <p className="inline-note">
        Type the words at these positions from the copy you just wrote down. Your phrase is no
        longer on this screen, so showing it again asks for your password.
      </p>
      {challenge.positions.map((position) => (
        <TextField
          key={position}
          label={`Word ${position + 1}`}
          secret
          autoComplete="off"
          spellCheck={false}
          value={answers[position] ?? ''}
          onChange={(event) => {
            setError(null);
            setAnswers((current) => ({ ...current, [position]: event.target.value }));
          }}
        />
      ))}
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {finish.error ? <Callout tone="danger">{finish.error}</Callout> : null}
      <div className="button-row">
        <Button variant="secondary" onClick={onBack}>
          Show my phrase again
        </Button>
        <Button
          variant="accent"
          loading={finish.pending}
          onClick={() => void finish.run().catch(() => undefined)}
        >
          Finish
        </Button>
      </div>
    </Dialog>
  );
}

function OwnPhraseRevealStep({
  accountId,
  onRevealed,
  onClose,
}: {
  accountId: string;
  onRevealed: (mnemonic: string) => void;
  onClose: () => void;
}) {
  const { wallet } = useWallet();
  const [password, setPassword] = useState('');

  const reveal = useAsyncAction(async () => {
    const material = await wallet.exportAccountSecret({ password, accountId });
    onRevealed(material.secret);
    setPassword('');
  });

  return (
    <Dialog title="Show the phrase again" onClose={onClose}>
      <p className="inline-note">
        The words are no longer on this page. Confirm your password to decrypt them from the vault
        on this device.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void reveal.run().catch(() => undefined);
        }}
      >
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {reveal.error ? <Callout tone="danger">{reveal.error}</Callout> : null}
        <Button
          type="submit"
          variant="accent"
          block
          style={{ marginTop: 12 }}
          loading={reveal.pending}
          disabled={password.length === 0}
        >
          Show my recovery phrase
        </Button>
      </form>
    </Dialog>
  );
}

async function buildChallenge(words: string[]): Promise<Challenge> {
  const positions = pickPositions(words.length, 3);
  const salt = randomSalt();
  const digests = await Promise.all(
    positions.map((position) => digestWord(salt, words[position] as string)),
  );
  return { positions, salt, digests };
}

async function digestWord(salt: string, word: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${word}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function pickPositions(total: number, count: number): number[] {
  const chosen = new Set<number>();
  const buffer = new Uint32Array(1);
  while (chosen.size < count) {
    crypto.getRandomValues(buffer);
    chosen.add((buffer[0] as number) % total);
  }
  return [...chosen].sort((a, b) => a - b);
}

/**
 * Import has two clearly separate paths, because a Ledgerly recovery phrase
 * and an XRPL family seed are different recovery routes and one is not a
 * substitute for the other.
 *
 * Nothing is added until the address has been derived locally and shown, so
 * pasting the wrong material fails on this screen instead of quietly adding a
 * wallet nobody can recognise.
 */
export function ImportAccountDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { wallet } = useWallet();
  const [mode, setMode] = useState<'phrase' | 'seed'>('phrase');
  const [secret, setSecret] = useState('');
  const [label, setLabel] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const held = useRef<PhraseBox>({ value: null });

  // The pasted secret is held in a wipeable box, never left in the confirm
  // screen's React state. Blank the field as soon as a preview is derived, and
  // empty the box when the import lands or the dialog goes away.
  useEffect(
    () => () => {
      held.current.value = null;
      setSecret('');
    },
    [],
  );

  const trimmed = secret.trim().replace(/\s+/g, ' ');
  const wordCount = trimmed === '' ? 0 : trimmed.split(' ').length;

  const check = useAsyncAction(async () => {
    if (mode === 'phrase' && !trimmed.includes(' ')) {
      throw new Error('That looks like a family seed. Use the family seed tab instead.');
    }
    if (mode === 'seed' && trimmed.includes(' ')) {
      throw new Error('That looks like a recovery phrase. Use the recovery phrase tab instead.');
    }
    const result = await wallet.previewImport({ secret: trimmed });
    if (result.alreadyPresent) {
      throw new Error('That wallet is already on this device.');
    }
    // A wallet coming back keeps the name it had before it was removed, taken
    // from this browser's memory or the signed-in profile. Only the label is
    // recalled; the address was derived locally from what was pasted.
    if (!label.trim()) {
      const remembered = await recallWalletName(result.address).catch(() => null);
      if (remembered) setLabel(remembered);
    }
    held.current.value = trimmed;
    setSecret('');
    setPreview(result);
  });

  const add = useAsyncAction(async () => {
    if (!preview) return;
    const raw = held.current.value ?? '';
    const name = label.trim() ? { label: label.trim() } : {};
    if (preview.kind === 'mnemonic') {
      await wallet.addAccountWithOwnPhrase({
        mnemonic: raw.toLowerCase(),
        expectedAddress: preview.address,
        ...name,
      });
    } else {
      await wallet.importAccount({
        seed: raw,
        expectedAddress: preview.address,
        ...name,
      });
    }
    held.current.value = null;
    setSecret('');
    setPreview(null);
    onDone();
  });

  if (preview) {
    return (
      <Dialog title="Confirm this wallet" onClose={onClose}>
        <p className="inline-note">
          Derived on this device from what you pasted. Nothing has been added yet. Check the address
          against the wallet you meant to import.
        </p>
        <div className="preview-address">
          <span className="preview-address-label">Resulting address</span>
          <strong className="mono">{preview.address}</strong>
          <span className="inline-note">{shortenAddress(preview.address, 10, 6)}</span>
          <CopyButton value={preview.address} label="Copy address" />
        </div>
        <DetailList
          items={[
            {
              label: 'Secret format',
              value: preview.kind === 'mnemonic' ? 'Recovery phrase' : 'XRPL family seed',
            },
            {
              label: 'Signing algorithm',
              value: <span className="mono">{preview.algorithm}</span>,
            },
            ...(preview.path
              ? [{ label: 'Derivation path', value: <span className="mono">{preview.path}</span> }]
              : []),
          ]}
        />
        <p className="inline-note">
          This wallet joins the wallets already on this device. Nothing else is replaced, and it
          keeps the secret format you pasted.
        </p>
        <TextField
          label="Name (optional)"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        {add.error ? <Callout tone="danger">{add.error}</Callout> : null}
        <div className="button-row">
          <Button
            variant="secondary"
            onClick={() => {
              setSecret(held.current.value ?? '');
              setPreview(null);
            }}
          >
            Back
          </Button>
          <Button
            variant="accent"
            loading={add.pending}
            onClick={() => void add.run().catch(() => undefined)}
          >
            Add this wallet
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Import an existing wallet" onClose={onClose}>
      <div className="button-row" style={{ marginTop: 0 }}>
        <Button
          variant={mode === 'phrase' ? 'accent' : 'secondary'}
          onClick={() => {
            setMode('phrase');
            held.current.value = null;
            setSecret('');
            check.clearError();
          }}
        >
          Recovery phrase
        </Button>
        <Button
          variant={mode === 'seed' ? 'accent' : 'secondary'}
          onClick={() => {
            setMode('seed');
            held.current.value = null;
            setSecret('');
            check.clearError();
          }}
        >
          XRPL family seed
        </Button>
      </div>

      <Callout tone="caution" title="This secret lives only here">
        What you paste goes straight into your encrypted vault on this device. It is never sent to
        us, never saved in the browser in the clear, and it is wiped from the screen once the import
        finishes. An imported wallet is not covered by the recovery phrase you already saved, so
        keep your own backup of it.
      </Callout>

      <TextAreaField
        label={mode === 'phrase' ? 'Recovery phrase' : 'Family seed'}
        secret
        rows={3}
        placeholder={mode === 'phrase' ? '12 or 24 words' : 's… or sEd…'}
        spellCheck={false}
        autoComplete="off"
        value={secret}
        style={{ marginTop: 12 }}
        onChange={(event) => setSecret(event.target.value)}
      />
      <p className="inline-note">
        {mode === 'phrase'
          ? `${wordCount} word${wordCount === 1 ? '' : 's'} so far. This accepts the 12 or 24 words Ledgerly gave you for a wallet with its own phrase, and phrases from other wallets that use the same format.`
          : 'A family seed is the older XRPL way of writing a single wallet key: one string starting with s or sEd. Wallets like Xaman and the XRPL Toolkit show it as the account secret. Ledgerly shows a family seed only for wallets that were imported as one; wallets Ledgerly created are backed up by their phrase instead.'}
      </p>

      {check.error ? <Callout tone="danger">{check.error}</Callout> : null}
      <Button
        variant="accent"
        block
        loading={check.pending}
        disabled={trimmed === ''}
        onClick={() => void check.run().catch(() => undefined)}
      >
        Show the resulting address
      </Button>
    </Dialog>
  );
}

/** One line describing how a wallet is backed up, for wallet detail rows. */
export function backupLabel(backup: AccountBackupKind): string {
  if (backup === 'external') return 'Held in Joey, signed there';
  if (backup === 'sharedPhrase') return 'Covered by your recovery phrase';
  if (backup === 'ownPhrase') return 'Has its own recovery phrase';
  return 'Imported secret, no phrase coverage';
}

/**
 * Renaming is deliberately two steps. The name field starts locked and shows
 * the saved name, so an open dialog cannot be typed into by accident and a
 * half typed name never looks like the real one. You press "Change account
 * name" to unlock the field, then "Save name" to commit it to the vault.
 */
export function RenameAccountDialog({
  accountId,
  onClose,
  onDone,
  allowRemove = false,
}: {
  accountId: string;
  onClose: () => void;
  onDone: () => void;
  allowRemove?: boolean;
}) {
  const { wallet, state } = useWallet();
  const account = state.accounts.find((candidate) => candidate.id === accountId);
  const saved = account?.label ?? '';

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(saved);
  const [savedNotice, setSavedNotice] = useState(false);

  const trimmed = label.trim();
  const unchanged = trimmed === saved;

  const rename = useAsyncAction(async () => {
    if (trimmed === '') throw new Error('Give the wallet a name first.');
    await wallet.renameAccount({ accountId, label: trimmed });
    setEditing(false);
    setSavedNotice(true);
    onDone();
  });

  const remove = useAsyncAction(async () => {
    await wallet.removeAccount({ accountId });
    onDone();
  });

  return (
    <Dialog
      eyebrow="Wallet"
      title={editing ? 'Change account name' : 'Account name'}
      onClose={onClose}
    >
      <TextField
        label="Account name"
        value={editing ? label : saved}
        readOnly={!editing}
        disabled={!editing}
        maxLength={40}
        onChange={(event) => setLabel(event.target.value)}
      />
      <p className="inline-note">
        {editing
          ? 'This name is stored in your encrypted vault on this device. It is only a label, so it never changes the address or the funds.'
          : 'The name is saved on this device. Press change to edit it.'}
      </p>

      {account ? (
        <div className="address-box">
          <span className="mono">{account.address}</span>
          <CopyButton value={account.address} />
        </div>
      ) : null}

      {rename.error ? <Callout tone="danger">{rename.error}</Callout> : null}
      {remove.error ? <Callout tone="danger">{remove.error}</Callout> : null}
      {savedNotice && !editing ? <Callout tone="info">Name saved.</Callout> : null}

      {editing ? (
        <div className="button-row" style={{ marginTop: 14 }}>
          <Button
            variant="accent"
            loading={rename.pending}
            disabled={trimmed === '' || unchanged}
            onClick={() => void rename.run().catch(() => undefined)}
          >
            Save name
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setLabel(saved);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="accent"
          block
          style={{ marginTop: 14 }}
          onClick={() => {
            setLabel(saved);
            setSavedNotice(false);
            setEditing(true);
          }}
        >
          Change account name
        </Button>
      )}

      {allowRemove && !editing && state.accounts.length > 1 ? (
        <Button
          variant="ghost"
          block
          style={{ marginTop: 8 }}
          loading={remove.pending}
          onClick={() => void remove.run().catch(() => undefined)}
        >
          Remove this account
        </Button>
      ) : null}
    </Dialog>
  );
}
