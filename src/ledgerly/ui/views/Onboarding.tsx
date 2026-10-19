import { useCallback, useEffect, useRef, useState } from 'react';
import { restoreRememberedNames } from '../cloud/sync';
import { Link } from '@tanstack/react-router';
import type { PasswordAssessment } from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { useSignedIn } from '../useSignedIn';

import { useAsyncAction } from '../store';
import { recordPlatformEvent } from '../metrics';
import { Button, Callout, TextAreaField, TextField } from '../components/primitives';
import { CopyButton } from '../components/primitives';
import { ShieldIcon } from '../components/icons';

/**
 * What the confirm step is given instead of the phrase: the positions to ask
 * about and a salted digest of each expected word. Enough to grade an answer,
 * useless to anyone reading the page, and the salt keeps the digests from being
 * matched back against the 2048-word list.
 */
type Challenge = { positions: number[]; salt: string; digests: string[] };

/**
 * The phrase is passed around in this mutable box rather than in React state or
 * props. React keeps old props and state reachable through retained fibers long
 * after a screen is gone, so a string handed to a component can outlive it; a
 * box can be emptied, and every holder sees the same empty box.
 */
type PhraseBox = { value: string | null };

type Step =
  | { name: 'welcome' }
  | { name: 'password'; mode: 'create' | 'importPhrase' | 'importSecret' }
  | { name: 'backup' }
  | { name: 'verify'; challenge: Challenge }
  // Re-showing the phrase from the confirm step costs the password: the words
  // are no longer in the page by then, and decrypting them again is the only
  // way back.
  | { name: 'reveal' };

/**
 * Setup, including the backup step.
 *
 * The vault exists from the moment the password is set, so the wallet is
 * technically unlocked before the phrase has been written down. Routing on
 * `backupConfirmed` rather than on lock status is what keeps the user here
 * until they have actually recorded it, and if they close the window midway,
 * they land back here on next open rather than on a funded-looking dashboard
 * whose only backup is a phrase they never saw.
 */
export function Onboarding() {
  const { state } = useWallet();
  const [step, setStep] = useState<Step>({ name: 'welcome' });
  const phrase = useRef<PhraseBox>({ value: null });

  const toBackup = useCallback((mnemonic: string) => {
    phrase.current.value = mnemonic;
    setStep({ name: 'backup' });
  }, []);

  useEffect(() => () => void (phrase.current.value = null), []);

  // Reopened partway through setup: the phrase is no longer in memory, so it
  // has to be revealed again with the password before it can be confirmed.
  if (
    state.status === 'unlocked' &&
    !state.preferences.backupConfirmed &&
    step.name !== 'backup' &&
    step.name !== 'verify'
  ) {
    return <ResumeBackup onRevealed={toBackup} />;
  }

  if (step.name === 'welcome') {
    return <Welcome onChoose={(mode) => setStep({ name: 'password', mode })} />;
  }
  if (step.name === 'password') {
    return (
      <PasswordStep
        mode={step.mode}
        onBack={() => setStep({ name: 'welcome' })}
        onCreated={toBackup}
      />
    );
  }
  if (step.name === 'backup') {
    return (
      <BackupStep
        phrase={phrase.current}
        onContinue={(challenge) => setStep({ name: 'verify', challenge })}
      />
    );
  }
  if (step.name === 'reveal') {
    return <ResumeBackup onRevealed={toBackup} />;
  }
  return <VerifyStep challenge={step.challenge} onBack={() => setStep({ name: 'reveal' })} />;
}

function ResumeBackup({ onRevealed }: { onRevealed: (mnemonic: string) => void }) {
  const { wallet } = useWallet();
  const [password, setPassword] = useState('');

  const reveal = useAsyncAction(async () => {
    onRevealed((await wallet.exportRecoveryPhrase({ password })).mnemonic);
    setPassword('');
  });

  return (
    <div className="stack">
      <div>
        <h2>Finish backing up</h2>
        <p className="inline-note" style={{ marginTop: 8 }}>
          Your wallet is ready, but its recovery phrase has not been written down yet. Confirm your
          password to see it again.
        </p>
      </div>

      <Callout tone="caution" title="Nothing else can restore this wallet">
        If you lose access to this device before recording the phrase, the funds are gone.
      </Callout>

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
    </div>
  );
}

function Welcome({
  onChoose,
}: {
  onChoose: (mode: 'create' | 'importPhrase' | 'importSecret') => void;
}) {
  const signedIn = useSignedIn();
  return (
    <div className="stack">
      <div>
        <span className="brand-mark">L</span>
        <h1 style={{ marginTop: 16 }}>
          {signedIn ? 'Set up this device' : 'Your keys, yours alone.'}
        </h1>
        <p className="inline-note" style={{ marginTop: 10 }}>
          {signedIn
            ? 'You are signed in to your Ledgerly profile. To send from this browser, create a new wallet or restore the keys for an existing one. You can also open your dashboard without restoring keys.'
            : 'Your XRP Ledger keys are created on your device and stay encrypted there. Ledgerly never holds them, nothing is uploaded, and no server ever sees your recovery phrase.'}
        </p>
      </div>

      {signedIn ? (
        <Link to="/balances" className="button button--accent button--block">
          Open my wallet dashboard
        </Link>
      ) : null}

      <Button variant={signedIn ? 'secondary' : 'accent'} block onClick={() => onChoose('create')}>
        Create a new wallet
      </Button>
      <Button variant="secondary" block onClick={() => onChoose('importPhrase')}>
        Restore from a recovery phrase
      </Button>
      <Button variant="ghost" block onClick={() => onChoose('importSecret')}>
        Import an XRPL secret
      </Button>

      <Link to="/wallets" className="button button--secondary button--block">
        Browse XRPL wallets
      </Link>
      <p className="inline-note" style={{ textAlign: 'center' }}>
        Prefer another XRPL wallet? See the wallets we recommend and download one. Signing in to
        Ledgerly with them is coming soon.
      </p>

      <Callout tone="positive" title="Non-custodial">
        You alone hold the keys. If you lose your recovery phrase and your password, nobody, not
        Ledgerly and not anyone, can restore access.
      </Callout>

      <Callout tone="info" title="One browser, one wallet set">
        Keys stay in the browser that created them, so they do not travel between devices. If you
        made a wallet on your phone or tablet and you are signing in on another device, choose
        "Restore from a recovery phrase" here. Clearing your browser data removes the keys too, and
        your phrase is the only way back in.
      </Callout>
    </div>
  );
}

function PasswordStep({
  mode,
  onBack,
  onCreated,
}: {
  mode: 'create' | 'importPhrase' | 'importSecret';
  onBack: () => void;
  onCreated: (mnemonic: string) => void;
}) {
  const { wallet, store, state } = useWallet();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phrase, setPhrase] = useState('');
  const [secret, setSecret] = useState('');
  const [assessment, setAssessment] = useState<PasswordAssessment | null>(null);

  const onPasswordChange = useCallback(
    (value: string) => {
      setPassword(value);
      void wallet.assessPassword({ password: value }).then(setAssessment);
    },
    [wallet],
  );

  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = useAsyncAction(async () => {
    if (mode === 'importSecret') {
      await wallet.importFromSeed({ password, seed: secret.trim() });
      const seeded = await store.refresh();
      await restoreRememberedNames(wallet, seeded.accounts).catch(() => undefined);
      await store.refresh();
      return;
    }
    const result = await wallet.createWallet({
      password,
      ...(mode === 'importPhrase' ? { mnemonic: phrase } : {}),
    });
    if (mode === 'importPhrase') {
      const restored = await store.refresh();
      // A restored device gets its wallet names back where they are remembered,
      // instead of coming up as Account 1, Account 2, Account 3.
      await restoreRememberedNames(wallet, restored.accounts).catch(() => undefined);
      await store.refresh();
      return;
    }
    const created = await store.refresh();
    const address = created.accounts[0]?.address;
    if (address) recordPlatformEvent('wallet_created', state.network.id, address);
    onCreated(result.mnemonic);
  });

  const ready =
    password.length > 0 &&
    confirm === password &&
    (assessment?.acceptable ?? false) &&
    (mode !== 'importPhrase' || phrase.trim().length > 0) &&
    (mode !== 'importSecret' || secret.trim().length > 0);

  const heading =
    mode === 'create'
      ? 'Choose a password'
      : mode === 'importPhrase'
        ? 'Restore your wallet'
        : 'Import a secret';

  return (
    <div className="stack">
      <div>
        <button className="link-button" onClick={onBack}>
          ← Back
        </button>
        <h2 style={{ marginTop: 12 }}>{heading}</h2>
        <p className="inline-note" style={{ marginTop: 8 }}>
          This password encrypts your keys on this device. It is never sent anywhere, and it cannot
          be reset.{' '}
          {mode === 'importSecret'
            ? 'Only the family seed for this wallet can restore it.'
            : 'Only the recovery phrase can restore your accounts.'}
        </p>
      </div>

      {mode === 'importPhrase' ? (
        <TextAreaField
          label="Recovery phrase"
          secret
          placeholder="Enter your 12 or 24 words, separated by spaces"
          spellCheck={false}
          autoComplete="off"
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          hint="Words are matched exactly. Extra spaces and capitals are fine."
        />
      ) : null}

      {mode === 'importPhrase' ? (
        <Callout tone="info" title="Bringing a wallet from another device">
          This is the right place if you created the wallet on a phone, tablet, or another browser.
          Restoring here rebuilds the same accounts on this device from your phrase. Your keys are
          never copied between devices for you.
        </Callout>
      ) : null}

      {mode === 'importSecret' ? (
        <TextField
          label="Family seed"
          secret
          placeholder="s… or sEd…"

          spellCheck={false}
          autoComplete="off"
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          hint="A wallet imported this way holds one account and has no recovery phrase."
        />
      ) : null}

      <div>
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
        <PasswordMeter assessment={assessment} />
      </div>

      <TextField
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        error={mismatch ? 'Passwords do not match.' : null}
      />

      {submit.error ? <Callout tone="danger">{submit.error}</Callout> : null}

      <Button
        variant="accent"
        block
        disabled={!ready}
        loading={submit.pending}
        onClick={() => void submit.run().catch(() => undefined)}
      >
        Continue
      </Button>
    </div>
  );
}

function PasswordMeter({ assessment }: { assessment: PasswordAssessment | null }) {
  if (!assessment) return null;
  return (
    <div>
      <div className="meter">
        {[1, 2, 3, 4].map((step) => (
          <i key={step} data-on={assessment.score >= step} data-score={assessment.score} />
        ))}
      </div>
      {assessment.warnings.length > 0 ? (
        <p className="field-hint" style={{ marginTop: 6 }}>
          {assessment.warnings[0]}
        </p>
      ) : null}
    </div>
  );
}

function BackupStep({
  phrase,
  onContinue,
}: {
  phrase: PhraseBox;
  onContinue: (challenge: Challenge) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  // The words live in a ref array that is emptied in place, not in state: a new
  // empty array would leave the old one reachable from a retained fiber.
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
    const challenge = await buildChallenge(words.current);
    words.current.fill('');
    words.current.length = 0;
    phrase.value = null;
    setRevealed(false);
    onContinue(challenge);
  });

  return (
    <div className="stack">
      <div>
        <h2>Write this down</h2>
        <p className="inline-note" style={{ marginTop: 8 }}>
          These 24 words restore your accounts on any wallet. Anyone who reads them can take your
          funds, so keep them off screens and out of cloud storage.
        </p>
      </div>

      <Callout tone="danger" title="Never type these into a website">
        No legitimate site, support agent, or airdrop will ever ask for your recovery phrase.
      </Callout>

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
        <Button variant="secondary" block onClick={() => setRevealed(true)}>
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
    </div>
  );
}

/**
 * Confirms the phrase was actually recorded. Three positions chosen at random
 * catches the common failure, clicking through the backup screen without
 * writing anything down, without making setup tedious.
 *
 * The phrase itself is not here. Answers are hashed with the challenge salt and
 * compared against the stored digests, so from the moment the user leaves the
 * backup screen there are no words left in the page to read.
 */
function VerifyStep({ challenge, onBack }: { challenge: Challenge; onBack: () => void }) {
  const { wallet, store } = useWallet();
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
    await wallet.confirmBackup();
    await store.refresh();
  });

  return (
    <div className="stack">
      <div>
        <button className="link-button" onClick={onBack}>
          Show my phrase again
        </button>
        <h2 style={{ marginTop: 12 }}>Confirm your backup</h2>
        <p className="inline-note" style={{ marginTop: 8 }}>
          Type the words at these positions from the copy you just wrote down. Your phrase is no
          longer on this screen, so showing it again asks for your password.
        </p>
      </div>

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

      <Button
        variant="accent"
        block
        loading={finish.pending}
        onClick={() => void finish.run().catch(() => undefined)}
      >
        <ShieldIcon /> Finish setup
      </Button>
    </div>
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

/** Salted so a digest cannot be looked up in the public 2048-word list. */
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
