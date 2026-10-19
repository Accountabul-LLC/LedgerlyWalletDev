import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { shortenAddress } from '@ledgerly/core/shared';

import { supabase } from '@/integrations/supabase/client';
import { useWallet, type Surface } from './context';
import { Activity } from './views/Activity';
import { Contacts } from './views/Contacts';
import { Dashboard } from './views/Dashboard';
import { Onboarding } from './views/Onboarding';
import { Settings } from './views/Settings';
import { Tokens } from './views/Tokens';
import { Unlock } from './views/Unlock';
import { ActivityIcon, CoinsIcon, SettingsIcon, UsersIcon, WalletIcon } from './components/icons';
import { Button, Dialog } from './components/primitives';
import { SiteHeader } from './components/SiteHeader';
import { broadcastSession, onSessionSignal, signOutEverywhere } from './session';

import {
  AddAccountDialog,
  ImportAccountDialog,
  NewPhraseAccountDialog,
} from './views/AccountDialogs';

export type ViewMode = 'single' | 'all';

/** Sessions always open on Mainnet; mirrors DEFAULT_NETWORK_ID in core. */
const DEFAULT_NETWORK_ID = 'mainnet';

type Tab = 'home' | 'tokens' | 'activity' | 'contacts' | 'settings';

const TABS: readonly { id: Tab; label: string; Icon: typeof WalletIcon }[] = [
  { id: 'home', label: 'Home', Icon: WalletIcon },
  { id: 'tokens', label: 'Tokens', Icon: CoinsIcon },
  { id: 'activity', label: 'Activity', Icon: ActivityIcon },
  { id: 'contacts', label: 'Contacts', Icon: UsersIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export type WalletTab = Tab;

interface ViewModeValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeValue>({
  viewMode: 'single',
  setViewMode: () => {},
});

export function useViewMode(): ViewModeValue {
  return useContext(ViewModeContext);
}

/** Screens that take over the whole surface before the wallet is usable. */
export type WalletGate = 'setup' | 'locked' | null;

export function App({
  surface,
  tab: controlledTab,
  onTabChange,
  onGateChange,
  children,
}: {
  surface: Surface;
  /** When the host owns navigation (routed web app), the active tab comes from the URL. */
  tab?: Tab;
  onTabChange?: (tab: Tab) => void;
  /**
   * Routed hosts give setup and unlock their own URLs, so App reports the gate
   * instead of rendering it inline. The popup has no router, so it keeps the
   * inline behaviour.
   */
  onGateChange?: (gate: WalletGate) => void;
  /** Routed hosts render the section themselves; the popup lets App pick it. */
  children?: ReactNode;
}) {
  const { wallet, store, state } = useWallet();
  const [internalTab, setInternalTab] = useState<Tab>('home');
  const tab = controlledTab ?? internalTab;
  const setTab = (next: Tab) => {
    if (onTabChange) onTabChange(next);
    else setInternalTab(next);
  };
  // A view preference only. The engine still keeps one active account, so
  // signing, approvals and site permissions are untouched by this.
  // Every session opens on the combined view so nothing is hidden behind a
  // switcher the moment someone signs in.
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // Sessions also start on Mainnet: a test network is a deliberate choice, not
  // something that should quietly carry over from the last visit.
  const resetNetwork = useRef(false);
  useEffect(() => {
    if (state.status !== 'unlocked' || resetNetwork.current) return;
    resetNetwork.current = true;
    if (state.network.id === DEFAULT_NETWORK_ID) return;
    void wallet.setNetwork({ networkId: DEFAULT_NETWORK_ID }).then(() => store.refresh());
  }, [state.status, state.network.id, wallet, store]);

  // A lock, sign out or erase anywhere ends the session in this tab too, and
  // an account, network or endpoint change throws away anything staged here.
  useEffect(
    () =>
      onSessionSignal((signal) => {
        if (signal === 'invalidate' || signal === 'vaultChanged') {
          // The vault changed in another tab. Re-read it here so this tab can
          // never keep showing an older set of wallets.
          void store.refresh();
          return;
        }
        // Lock and erase both drop keys here; a sign-out in another tab also
        // leaves this one on a page it is no longer entitled to.
        void wallet
          .lock()
          .catch(() => undefined)
          .then(() => store.refresh())
          .then(() => {
            if (signal === 'signOut' && typeof window !== 'undefined') {
              window.location.replace('/auth');
            }
          });
      }),

    [wallet, store],
  );

  // Setup owns the screen until the recovery phrase has been confirmed, even
  // though the vault is already unlocked by then.
  const inSetup =
    state.status === 'uninitialized' ||
    (state.status === 'unlocked' && !state.preferences.backupConfirmed);

  const gate: WalletGate = inSetup ? 'setup' : state.status === 'locked' ? 'locked' : null;

  useEffect(() => {
    onGateChange?.(gate);
  }, [gate, onGateChange]);

  if (gate) {
    return (
      <div className={`shell shell--${surface}`}>
        {onGateChange ? <SiteHeader /> : null}
        <div className="body body--narrow">
          {onGateChange ? children : gate === 'setup' ? <Onboarding /> : <Unlock />}
        </div>
      </div>
    );
  }

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      <div className={`shell shell--${surface}`}>
        <TopBar onHome={() => setTab('home')} viewMode={viewMode} onViewModeChange={setViewMode} />
        <nav className="tabbar" aria-label="Sections">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} aria-current={tab === id} onClick={() => setTab(id)}>
              <Icon />
              {label}
            </button>
          ))}
        </nav>

        <div className="body">
          {children ?? (
            <>
              {tab === 'home' ? (
                <Dashboard
                  viewMode={viewMode}
                  onFocusAccount={() => {
                    setViewMode('single');
                    setTab('home');
                  }}
                />
              ) : null}
              {tab === 'tokens' ? <Tokens /> : null}
              {tab === 'activity' ? <Activity /> : null}
              {tab === 'contacts' ? <Contacts /> : null}
              {tab === 'settings' ? <Settings /> : null}
            </>
          )}
        </div>
      </div>
    </ViewModeContext.Provider>
  );
}

function NetworkMenu() {
  const { wallet, store, state } = useWallet();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pending = state.networks.find((network) => network.id === pendingId) ?? null;

  const confirm = () => {
    if (!pending || switching) return;
    setSwitchError(null);
    setSwitching(true);
    // A staged transaction was priced and prepared for the old network.
    broadcastSession('invalidate');
    void wallet
      .setNetwork({ networkId: pending.id })
      .then(() => store.refresh())
      .then(() => setPendingId(null))
      .catch((error: unknown) =>
        setSwitchError(error instanceof Error ? error.message : 'Could not switch networks.'),
      )
      .finally(() => setSwitching(false));
  };

  return (
    <div className="network-menu" ref={wrapRef}>
      <button
        type="button"
        className={`pill pill--button ${state.network.isTest ? 'pill--test' : 'pill--live'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Network"
        disabled={switching}
        onClick={() => setOpen((value) => !value)}
      >
        <ConnectionDot />
        <span className="pill-label">{state.network.label}</span>
        <span className="pill-tag">{state.network.isTest ? 'TEST' : 'LIVE'}</span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div className="network-menu-list" role="listbox" aria-label="Networks">
          {state.networks.map((network) => (
            <button
              key={network.id}
              type="button"
              role="option"
              aria-selected={network.id === state.network.id}
              className={`network-menu-item ${network.id === state.network.id ? 'is-active' : ''}`}
              onClick={() => {
                setOpen(false);
                if (network.id === state.network.id) return;
                setSwitchError(null);
                setPendingId(network.id);
              }}
            >
              <span className="network-menu-item-main">
                <span className="network-menu-item-label">{network.label}</span>
                <span className="network-menu-item-hint">
                  {network.isTest ? 'Test funds only' : 'Real funds'}
                </span>
              </span>
              <span className={`pill-tag ${network.isTest ? 'pill-tag--test' : 'pill-tag--live'}`}>
                {network.isTest ? 'TEST' : 'LIVE'}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {pending ? (
        <Dialog
          eyebrow="Switch network"
          title={`Switch to ${pending.label}?`}
          onClose={() => (switching ? undefined : setPendingId(null))}
        >
          <p className="network-confirm-copy">
            {pending.isTest
              ? `You are switching to ${pending.label}. Funds on this network are not real money, so balances and transactions here are for testing only.`
              : `You are switching to ${pending.label}. This is a live network, so balances are real money and transactions cannot be reversed.`}
          </p>
          {switchError ? (
            <p className="field-error" role="alert">
              {switchError}
            </p>
          ) : null}
          <div className="button-row">
            <Button variant="secondary" onClick={() => setPendingId(null)} disabled={switching}>
              Cancel
            </Button>
            <Button onClick={confirm} loading={switching}>
              Switch to {pending.label}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`chevron ${open ? 'chevron--open' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TopBar({
  onHome,
  viewMode,
  onViewModeChange,
}: {
  onHome: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  const { store, wallet, state } = useWallet();

  return (
    <header className="topbar">
      <button
        className="brand"
        onClick={() => {
          onHome();
          void store.refresh();
        }}
      >
        <span className="brand-mark">L</span>
        Ledgerly
      </button>

      <div className="topbar-actions">
        <NetworkMenu />
        <AccountMenu viewMode={viewMode} onViewModeChange={onViewModeChange} onHome={onHome} />
        {state.status === 'unlocked' ? (
          <button
            type="button"
            className="pill pill--button"
            title="Lock this wallet"
            onClick={() => {
              broadcastSession('lock');
              void wallet.lock().then(() => store.refresh());
            }}
          >
            Lock
          </button>
        ) : null}
        <ProfileButton />
      </div>
    </header>
  );
}

/**
 * The wallet works with no account at all, so this control reflects whichever
 * mode the person is in: sign out when a profile is attached, or an invitation
 * to attach one when it is not.
 */
function ProfileButton() {
  const { wallet, surface } = useWallet();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (signedIn === null) return null;

  // The toolbar popup is narrow, so profile actions live in Settings there.
  if (surface === 'popup' && !signedIn) return null;

  if (!signedIn) {
    // The extension popup has no /auth route of its own, so it sends people to
    // the website in a new tab instead of a dead link inside the popup.
    const href = surface === 'popup' ? 'https://ledgerlywallet.com/auth' : '/auth';
    return (
      <a
        className="pill pill--button"
        href={href}
        target={surface === 'popup' ? '_blank' : undefined}
        rel={surface === 'popup' ? 'noreferrer' : undefined}
        title="Keep wallet names and payees with you"
      >
        Save to a profile
      </a>
    );
  }

  return (
    <button
      type="button"
      className="pill pill--button"
      title={error ?? 'Sign out of your Ledgerly profile'}
      disabled={leaving}
      onClick={() => {
        if (leaving) return;
        setLeaving(true);
        setError(null);
        // One awaited flow: lock, sign out, confirm the session is gone, and
        // only then leave. A history replace, not a push, so Back cannot
        // restore the signed-in shell.
        void signOutEverywhere(() => wallet.lock())
          .then(() => {
            window.location.replace('/auth');
          })
          .catch((caught: unknown) => {
            setLeaving(false);
            setError(caught instanceof Error ? caught.message : 'Could not sign out.');
          });
      }}
    >
      {leaving ? 'Signing out…' : error ? 'Try signing out again' : 'Sign out'}
    </button>
  );
}

function AccountMenu({
  viewMode,
  onViewModeChange,
  onHome,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onHome: () => void;
}) {
  const { wallet, store, state, surface } = useWallet();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'add' | 'ownPhrase' | 'import' | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (state.accounts.length === 0) return null;

  const active = state.accounts.find((candidate) => candidate.id === state.activeAccountId);
  const label =
    viewMode === 'all'
      ? `All wallets · ${state.accounts.length}`
      : active
        ? `${active.label} · ${shortenAddress(active.address, 4, 4)}`
        : 'Select a wallet';

  const pick = (accountId: string) => {
    setOpen(false);
    onViewModeChange('single');
    onHome();
    broadcastSession('invalidate');
    void wallet.selectAccount({ accountId }).then(() => store.refresh());
  };

  return (
    <div className="network-menu" ref={wrapRef}>
      <button
        type="button"
        className="pill pill--button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Wallet"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="pill-label">{label}</span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div className="network-menu-list">
          <div className="menu-scroll" role="listbox" aria-label="Wallets">
            {state.accounts.length > 1 ? (
              <button
                type="button"
                role="option"
                aria-selected={viewMode === 'all'}
                className={`network-menu-item ${viewMode === 'all' ? 'is-active' : ''}`}
                onClick={() => {
                  setOpen(false);
                  onViewModeChange('all');
                  onHome();
                }}
              >
                <span className="network-menu-item-main">
                  <span className="network-menu-item-label">All wallets</span>
                  <span className="network-menu-item-hint">
                    Combined total across {state.accounts.length} wallets
                  </span>
                </span>
                {viewMode === 'all' ? <CheckIcon /> : null}
              </button>
            ) : null}

            {state.accounts.map((candidate) => {
              const isActive = viewMode === 'single' && candidate.id === state.activeAccountId;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`network-menu-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => pick(candidate.id)}
                >
                  <span className="network-menu-item-main">
                    <span className="network-menu-item-label">{candidate.label}</span>
                    <span className="network-menu-item-hint mono">
                      {shortenAddress(candidate.address, 6, 6)}
                    </span>
                  </span>
                  {isActive ? <CheckIcon /> : null}
                </button>
              );
            })}
          </div>

          <div className="menu-footer">
            {surface === 'web' ? (
              <a className="menu-footer-action" href="/wallet/add" onClick={() => setOpen(false)}>
                Add or import a wallet…
              </a>
            ) : null}

            <button
              type="button"
              className="menu-footer-action"
              onClick={() => {
                setOpen(false);
                setDialog('add');
              }}
            >
              Add a wallet
            </button>
            <button
              type="button"
              className="menu-footer-action"
              onClick={() => {
                setOpen(false);
                setDialog('ownPhrase');
              }}
            >
              New wallet with its own phrase
            </button>
            <button
              type="button"
              className="menu-footer-action"
              onClick={() => {
                setOpen(false);
                setDialog('import');
              }}
            >
              Import an existing wallet
            </button>
          </div>
        </div>
      ) : null}

      {dialog === 'add' ? (
        <AddAccountDialog
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            void store.refresh();
          }}
        />
      ) : null}

      {dialog === 'ownPhrase' ? (
        <NewPhraseAccountDialog
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            void store.refresh();
          }}
        />
      ) : null}

      {dialog === 'import' ? (
        <ImportAccountDialog
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            void store.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ConnectionDot() {
  const { state, store } = useWallet();
  const status = state.connection.status;

  // The engine pushes state changes, but a failed connection is worth re-checking on a timer.
  useEffect(() => {
    if (status !== 'error') return;
    const timer = setInterval(() => void store.refresh(), 8000);
    return () => clearInterval(timer);
  }, [status, store]);

  const title =
    status === 'connected'
      ? `Connected to ${state.network.label}`
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'error'
          ? (state.connection.error ?? 'Connection problem')
          : 'Not connected';

  return <span className={`status-dot status-dot--${status}`} title={title} aria-label={title} />;
}
