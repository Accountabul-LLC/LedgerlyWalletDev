import { useEffect, useState } from 'react';
import { useWallet } from '../context';
import { useAsyncAction } from '../store';
import { Button, Callout, Dialog, TextField } from '../components/primitives';
import { LockIcon } from '../components/icons';
import { formatDuration } from '../format';

export function Unlock() {
  const { wallet, store, state } = useWallet();
  const [password, setPassword] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [startFresh, setStartFresh] = useState(false);

  const lockoutUntil = state.lockoutUntil;

  useEffect(() => {
    if (!lockoutUntil) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const left = lockoutUntil - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) void store.refresh();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil, store]);

  const unlock = useAsyncAction(async () => {
    await wallet.unlock({ password });
    setPassword('');
    await store.refresh();
  });

  const throttled = remaining > 0;

  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <span className="brand-mark" style={{ margin: '0 auto' }}>
          L
        </span>
        <h2 style={{ marginTop: 16 }}>Welcome back</h2>
        <p className="inline-note" style={{ marginTop: 8 }}>
          Enter your password to unlock this wallet.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!throttled) void unlock.run().catch(() => undefined);
        }}
      >
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          disabled={throttled}
          onChange={(event) => setPassword(event.target.value)}
        />

        {throttled ? (
          <Callout tone="caution" title="Too many attempts">
            Unlocking is paused for {formatDuration(remaining)}. This delay grows with each wrong
            password.
          </Callout>
        ) : null}

        {unlock.error && !throttled ? <Callout tone="danger">{unlock.error}</Callout> : null}

        <Button
          type="submit"
          variant="accent"
          block
          style={{ marginTop: 14 }}
          disabled={password.length === 0 || throttled}
          loading={unlock.pending}
        >
          <LockIcon /> Unlock
        </Button>
      </form>

      <Callout tone="info" title="New device?">
        Wallets live in the browser you created them in, so they do not follow you from one device
        to another. If you made this wallet on a phone or tablet and you are signing in somewhere
        else, restore it here with your recovery phrase. Only wallet names and contacts sync, never
        your keys.
        <br />
        <a className="link-button" href="/balances">
          See your balances without unlocking
        </a>{' '}
        if you just want to check what your wallets hold on this device.
      </Callout>

      <p className="inline-note" style={{ textAlign: 'center' }}>
        To add or import another wallet, unlock first and use the wallet menu in the top bar.
      </p>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <p className="inline-note" style={{ textAlign: 'center', marginBottom: 12 }}>
          Forgotten your password? Only this wallet's recovery phrase, or its family seed if you
          imported one, can restore it. There is no reset link, because nobody else holds a copy.
        </p>
        <Button block variant="ghost" onClick={() => setStartFresh(true)}>
          Clear this wallet and start over
        </Button>
      </div>

      {startFresh ? (
        <StartFreshDialog
          onClose={() => setStartFresh(false)}
          onDone={() => void store.refresh()}
        />
      ) : null}
    </div>
  );
}

function StartFreshDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { wallet } = useWallet();
  const [confirmation, setConfirmation] = useState('');

  const reset = useAsyncAction(async () => {
    await wallet.resetWallet({ confirmation });
    onDone();
  });

  return (
    <Dialog title="Start with a new wallet" onClose={onClose}>
      <Callout tone="danger" title="There is no undo">
        This clears the wallet stored in this browser. Without its recovery phrase written down,
        every account in it becomes permanently unreachable. After this you can create a new wallet
        or restore one from a recovery phrase.
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
        Clear and start fresh
      </Button>
    </Dialog>
  );
}
