import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { WalletState } from '../../src/ledgerly/core';
import ledgerlyIcon from './assets/ledgerly-icon.png';
import { getAuthConfigurationError, getSupabaseClient } from './src/auth';
import { BRAND } from './src/brand';
import { VALIDATION_RETRY_COPY, validationFailureKind } from './src/sessionValidation';
import { createNativeWallet } from './src/wallet';
import { WalletHome } from './src/WalletHome';
import { MarketPanel } from './src/MarketPanel';
import { ForegroundWallet } from '../../src/ledgerly/native/foreground';

type SetupMode = 'create' | 'restore';
type AuthMode = 'signIn' | 'signUp';

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="dark" />
      <AuthenticatedApp />
    </SafeAreaProvider>
  );
}

function AuthenticatedApp() {
  const [exploringMarkets, setExploringMarkets] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(getAuthConfigurationError());
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const retryValidation = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (authError) {
      setAuthReady(true);
      return;
    }

    const supabase = getSupabaseClient();
    let active = true;
    let generation = 0;
    let validatedUserId: string | null = null;
    const current = (request: number) => active && request === generation;
    const retainForRetry = (request: number) => {
      if (!current(request)) return;
      validatedUserId = null;
      setSession(null);
      setValidationMessage(VALIDATION_RETRY_COPY);
    };
    const clearInvalidSession = async (request: number) => {
      if (!current(request)) return;
      validatedUserId = null;
      setSession(null);
      setValidationMessage(null);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // The wallet stays closed when local cleanup fails.
      }
    };
    const validate = async (candidate: Session | null, request: number) => {
      try {
        if (!candidate) {
          if (current(request)) {
            validatedUserId = null;
            setSession(null);
            setValidationMessage(null);
          }
          return;
        }
        const { data, error } = await supabase.auth.getUser(candidate.access_token);
        if (!current(request)) return;
        if (!error && data.user?.id === candidate.user.id) {
          validatedUserId = candidate.user.id;
          setValidationMessage(null);
          setSession(candidate);
          return;
        }
        if (error && validationFailureKind(error) !== 'invalid') {
          retainForRetry(request);
          return;
        }
        await clearInvalidSession(request);
      } catch (error) {
        if (!current(request)) return;
        if (validationFailureKind(error) === 'invalid') await clearInvalidSession(request);
        else retainForRetry(request);
      } finally {
        if (current(request)) setAuthReady(true);
      }
    };
    const restore = (request: number) => {
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) throw error;
          if (current(request)) return validate(data.session, request);
        })
        .catch((error: unknown) => {
          if (!current(request)) return;
          if (validationFailureKind(error) === 'invalid') void clearInvalidSession(request);
          else retainForRetry(request);
          setAuthReady(true);
        });
    };
    retryValidation.current = () => {
      if (!active) return;
      const request = ++generation;
      setValidationMessage(null);
      setAuthReady(false);
      restore(request);
    };
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active || _event === 'INITIAL_SESSION') return;
      const request = ++generation;
      if (!nextSession) {
        validatedUserId = null;
        setSession(null);
        setValidationMessage(null);
        setAuthReady(true);
        return;
      }
      // Unmount and lock the old wallet immediately on a profile change.
      if (nextSession.user.id !== validatedUserId) {
        setSession(null);
        setAuthReady(false);
      }
      // Validate the exact candidate token without entering the SDK's session lock.
      void Promise.resolve().then(() => validate(nextSession, request));
    });

    restore(generation);

    return () => {
      active = false;
      retryValidation.current = null;
      authListener.subscription.unsubscribe();
    };
  }, [authError]);

  useEffect(() => {
    if (authError) return;
    const supabase = getSupabaseClient();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, [authError]);

  if (exploringMarkets) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <Button
            label={session ? 'Back to Ledgerly' : 'Back to sign in'}
            onPress={() => setExploringMarkets(false)}
          />
          <MarketPanel expanded />
        </View>
      </SafeAreaView>
    );
  }

  if (!authReady) {
    return (
      <Screen centered>
        <Image source={ledgerlyIcon} style={styles.launchIcon} />
        <ActivityIndicator color={BRAND.ink} />
        <Text style={styles.loadingCopy}>Opening Ledgerly securely…</Text>
      </Screen>
    );
  }

  if (authError) {
    return (
      <Screen>
        <BrandHeader />
        <Card>
          <Eyebrow>Account unavailable</Eyebrow>
          <Title>Ledgerly sign-in could not start.</Title>
          <Body>{authError}</Body>
        </Card>
      </Screen>
    );
  }

  if (validationMessage) {
    return (
      <Screen>
        <BrandHeader />
        <Card>
          <Eyebrow>Account check paused</Eyebrow>
          <Title>Ledgerly could not confirm this sign-in.</Title>
          <Body>{validationMessage}</Body>
          <Button label="Try again" onPress={() => retryValidation.current?.()} />
        </Card>
      </Screen>
    );
  }

  if (!session) return <AuthScreen onExplore={() => setExploringMarkets(true)} />;

  return (
    <LedgerlyWalletApp
      key={session.user.id}
      onExploreMarkets={() => setExploringMarkets(true)}
      accountEmail={session.user.email ?? 'Signed-in Ledgerly account'}
      onSignOut={() =>
        getSupabaseClient()
          .auth.signOut()
          .then(({ error }) => {
            if (error) throw error;
          })
      }
    />
  );
}

function LedgerlyWalletApp({
  accountEmail,
  onSignOut,
  onExploreMarkets,
}: {
  accountEmail: string;
  onSignOut: () => Promise<void>;
  onExploreMarkets?: () => void;
}) {
  const [state, setState] = useState<WalletState | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  const wallet = useMemo(() => createNativeWallet(), []);
  const lifecycle = useMemo(
    () => new ForegroundWallet(() => wallet.lock(), AppState.currentState === 'active'),
    [wallet],
  );
  const runSensitive = useCallback(
    <T,>(operation: () => Promise<T>) => lifecycle.run(operation),
    [lifecycle],
  );
  const refreshGeneration = useRef(0);
  const invalidateRefresh = useCallback(() => {
    refreshGeneration.current++;
  }, []);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const next = await wallet.getState();
      if (generation !== refreshGeneration.current) return;
      if (next.status !== 'unlocked') setRecoveryPhrase(null);
      setState(next);
    } catch (error) {
      setFatalError(messageOf(error));
    }
  }, [wallet]);

  useEffect(() => {
    void wallet
      .start()
      .then(refresh)
      .catch((error: unknown) => setFatalError(messageOf(error)));
  }, [refresh, wallet]);

  useEffect(() => wallet.subscribe(() => void refresh()), [refresh, wallet]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const active = next === 'active';
      setForeground(active);
      if (!active) {
        invalidateRefresh();
        setRecoveryPhrase(null);
        setState((current) =>
          current
            ? {
                ...current,
                status: current.status === 'uninitialized' ? 'uninitialized' : 'locked',
                accounts: [],
                activeAccountId: null,
                sessionExpiresAt: null,
              }
            : null,
        );
      }
      void lifecycle
        .setActive(active)
        .then(refresh)
        .catch((error: unknown) => setFatalError(messageOf(error)));
    });
    return () => {
      subscription.remove();
      invalidateRefresh();
      void lifecycle.setActive(false).catch(() => undefined);
    };
  }, [refresh, lifecycle, invalidateRefresh]);

  if (!foreground)
    return (
      <Screen centered>
        <Title>Wallet locked.</Title>
      </Screen>
    );

  if (fatalError) {
    return (
      <Screen>
        <BrandHeader />
        <Card>
          <Eyebrow>Unable to start</Eyebrow>
          <Title>Ledgerly could not open its local vault.</Title>
          <Body>{fatalError}</Body>
          <Button
            label="Try again"
            onPress={() => {
              setFatalError(null);
              void refresh();
            }}
          />
        </Card>
      </Screen>
    );
  }

  if (!state) {
    return (
      <Screen centered>
        <Image source={ledgerlyIcon} style={styles.launchIcon} />
        <ActivityIndicator color={BRAND.ink} />
        <Text style={styles.loadingCopy}>Opening your wallet securely…</Text>
      </Screen>
    );
  }

  if (state.status === 'unlocked' && recoveryPhrase) {
    return (
      <BackupScreen
        phrase={recoveryPhrase}
        onConfirmed={async () => {
          await lifecycle.run(() => wallet.confirmBackup());
          setRecoveryPhrase(null);
          await refresh();
        }}
      />
    );
  }

  if (state.status === 'uninitialized') {
    return (
      <SetupScreen
        onCreate={async (password, mnemonic) => {
          const result = await lifecycle.run(() =>
            wallet.createWallet({ password, ...(mnemonic ? { mnemonic } : {}) }),
          );
          if (!mnemonic) setRecoveryPhrase(result.mnemonic);
          await refresh();
        }}
      />
    );
  }

  if (state.status === 'locked') {
    return (
      <UnlockScreen
        onExploreMarkets={onExploreMarkets}
        onUnlock={async (password) => {
          await lifecycle.run(() => wallet.unlock({ password }));
          await refresh();
        }}
      />
    );
  }

  if (!state.preferences.backupConfirmed) {
    return (
      <UnlockScreen
        backup
        onExploreMarkets={onExploreMarkets}
        onUnlock={async (password) => {
          const result = await lifecycle.run(() => wallet.resumePendingBackup({ password }));
          setRecoveryPhrase(result.mnemonic);
          await refresh();
        }}
      />
    );
  }

  return (
    <WalletHome
      wallet={wallet}
      runSensitive={runSensitive}
      state={state}
      accountEmail={accountEmail}
      onStateChanged={refresh}
      onLock={async () => {
        await wallet.lock();
        await refresh();
      }}
      onSignOut={async () => {
        await wallet.lock();
        await onSignOut();
      }}
    />
  );
}

function AuthScreen({ onExplore }: { onExplore?: () => void } = {}) {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);

  const submit = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = getSupabaseClient();
      if (mode === 'signIn') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice('Check your email to confirm the account, then return here and sign in.');
          setMode('signIn');
        }
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <BrandHeader />
      <Card>
        <Eyebrow>Ledgerly account</Eyebrow>
        <Title>
          {mode === 'signIn' ? 'Sign in to Ledgerly.' : 'Create your Ledgerly account.'}
        </Title>
        <Body>
          Sign in with the same email and password you use on Ledgerly Wallet. Your wallet keys and
          recovery phrase remain encrypted on this phone.
        </Body>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
          onSubmitEditing={() => void submit()}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Button
          label={mode === 'signIn' ? 'Sign in' : 'Create account'}
          onPress={() => void submit()}
          loading={busy}
          disabled={!email.trim() || !password}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
            setError(null);
            setNotice(null);
          }}
          style={styles.authSwitch}
        >
          <Text style={styles.authSwitchText}>
            {mode === 'signIn' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
        {onExplore ? <Button label="Explore XRPL markets" onPress={onExplore} /> : null}
      </Card>
    </FormScreen>
  );
}

function SetupScreen({
  onCreate,
}: {
  onCreate: (password: string, mnemonic?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<SetupMode>('create');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  const submit = async () => {
    if (pending.current) return;
    setError(null);
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      await onCreate(password, mode === 'restore' ? mnemonic.trim() : undefined);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <BrandHeader />
      <Card>
        <Eyebrow>Self-custody wallet</Eyebrow>
        <Title>
          {mode === 'create' ? 'Create your Ledgerly wallet.' : 'Restore your Ledgerly wallet.'}
        </Title>
        <Body>
          Your keys are encrypted on this device. Ledgerly never receives your recovery phrase.
        </Body>
        <View style={styles.segmented}>
          <Segment label="Create" selected={mode === 'create'} onPress={() => setMode('create')} />
          <Segment
            label="Restore"
            selected={mode === 'restore'}
            onPress={() => setMode('restore')}
          />
        </View>
        {mode === 'restore' ? (
          <Field
            label="24-word recovery phrase"
            value={mnemonic}
            onChangeText={setMnemonic}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
          />
        ) : null}
        <Field
          label="Wallet password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          label={mode === 'create' ? 'Create wallet' : 'Restore wallet'}
          onPress={() => void submit()}
          loading={busy}
          disabled={!password || !confirm || (mode === 'restore' && !mnemonic.trim())}
        />
      </Card>
    </FormScreen>
  );
}

function BackupScreen({
  phrase,
  onConfirmed,
}: {
  phrase: string;
  onConfirmed: () => Promise<void>;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const words = phrase.split(' ');
  return (
    <FormScreen>
      <BrandHeader />
      <Card>
        <Eyebrow>Recovery phrase</Eyebrow>
        <Title>Write these words down in order.</Title>
        <Body>
          Anyone with these words controls the wallet. Ledgerly will not show them again without
          your password.
        </Body>
        <View style={styles.wordGrid}>
          {words.map((word, index) => (
            <View key={`${word}-${index}`} style={styles.wordCell}>
              <Text style={styles.wordNumber}>{index + 1}</Text>
              <Text style={styles.word}>{word}</Text>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged }}
          accessibilityLabel="I saved the phrase offline and understand it cannot be recovered for me."
          style={styles.checkRow}
          onPress={() => setAcknowledged((value) => !value)}
        >
          <View style={[styles.checkbox, acknowledged && styles.checkboxChecked]}>
            {acknowledged ? (
              <Text allowFontScaling={false} style={styles.checkmark}>
                ✓
              </Text>
            ) : null}
          </View>
          <Text style={styles.checkCopy}>
            I saved the phrase offline and understand it cannot be recovered for me.
          </Text>
        </Pressable>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          label="I saved my phrase"
          disabled={!acknowledged}
          loading={busy}
          onPress={() => {
            if (pending.current || !acknowledged) return;
            pending.current = true;
            setBusy(true);
            setError(null);
            void onConfirmed()
              .catch((cause: unknown) => setError(messageOf(cause)))
              .finally(() => {
                pending.current = false;
                setBusy(false);
              });
          }}
        />
      </Card>
    </FormScreen>
  );
}

function UnlockScreen({
  onUnlock,
  backup = false,
  onExploreMarkets,
}: {
  onUnlock: (password: string) => Promise<void>;
  backup?: boolean;
  onExploreMarkets?: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const submit = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onUnlock(password);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <FormScreen>
      <BrandHeader />
      <Card>
        <Eyebrow>Welcome back</Eyebrow>
        <Title>{backup ? 'Finish your wallet backup.' : 'Unlock your wallet.'}</Title>
        <Body>
          {backup
            ? 'Confirm your wallet password to see your recovery phrase and finish saving it.'
            : 'Your wallet locks whenever Ledgerly leaves the foreground.'}
        </Body>
        <Field
          label="Wallet password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          onSubmitEditing={() => void submit()}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Unlock" onPress={() => void submit()} loading={busy} disabled={!password} />
        {onExploreMarkets ? (
          <Button label="Explore XRPL markets" onPress={onExploreMarkets} />
        ) : null}
      </Card>
    </FormScreen>
  );
}

function Screen({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.screen, centered && styles.centered]}>{children}</View>
    </SafeAreaView>
  );
}

function FormScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.formScreen}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BrandHeader() {
  return (
    <View style={styles.brandHeader}>
      <Image source={ledgerlyIcon} style={styles.brandIcon} />
      <Text style={styles.brandWordmark}>Ledgerly</Text>
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

function Field(props: ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        multiline={multiline}
        placeholderTextColor={BRAND.muted}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function Segment({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segment, selected && styles.segmentSelected]}>
      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={BRAND.green} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function messageOf(error: unknown): string {
  const detail =
    error !== null && typeof error === 'object'
      ? (error as { code?: unknown; name?: unknown; status?: unknown })
      : {};
  switch (detail.code) {
    case 'invalid_credentials':
      return 'The email or password is incorrect.';
    case 'email_not_confirmed':
      return 'Confirm your email before signing in.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'bad_jwt':
      return 'Account sign-in configuration could not be validated. Please try again later.';
    case 'ERR_WRITE':
    case 'ERR_ENCRYPT':
    case 'ERR_DECRYPT':
    case 'ERR_KEY_STORE':
      return 'Secure account storage is unavailable on this device. Please try again.';
  }
  if (
    detail.name === 'AuthRetryableFetchError' ||
    (error instanceof Error &&
      ['Network request failed', 'Failed to fetch'].includes(error.message))
  )
    return 'Could not connect to account sign-in. Check your connection and try again.';
  const safe = [
    'Invalid login credentials',
    'Email not confirmed',
    'The wallet locked. Please unlock and try again.',
  ];
  const message = error instanceof Error ? error.message : '';
  return safe.includes(message)
    ? message
    : 'Something went wrong. Please check your input and try again.';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: BRAND.cream },
  screen: {
    flex: 1,
    backgroundColor: BRAND.cream,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 18,
  },
  formScreen: {
    flexGrow: 1,
    backgroundColor: BRAND.cream,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 20,
  },
  centered: { alignItems: 'center', justifyContent: 'center' },
  launchIcon: { width: 92, height: 92, borderRadius: 22, marginBottom: 18 },
  loadingCopy: { marginTop: 12, color: BRAND.muted, fontSize: 14 },
  brandHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { width: 48, height: 48, borderRadius: 12 },
  brandWordmark: {
    color: BRAND.ink,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 28,
    fontWeight: '700',
  },
  card: {
    backgroundColor: BRAND.paper,
    borderColor: BRAND.line,
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    gap: 16,
    shadowColor: BRAND.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  eyebrow: {
    color: BRAND.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: BRAND.ink,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  body: { color: BRAND.inkSoft, fontSize: 15, lineHeight: 23 },
  error: { color: BRAND.danger, fontSize: 14, lineHeight: 20 },
  notice: { color: BRAND.inkSoft, fontSize: 14, lineHeight: 20 },
  authSwitch: { alignItems: 'center', paddingVertical: 8 },
  authSwitchText: { color: BRAND.purple, fontSize: 14, fontWeight: '800' },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: BRAND.cream },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11 },
  segmentSelected: { backgroundColor: BRAND.ink },
  segmentText: { color: BRAND.ink, fontSize: 14, fontWeight: '700' },
  segmentTextSelected: { color: BRAND.green },
  field: { gap: 7 },
  fieldLabel: { color: BRAND.ink, fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 50,
    borderColor: BRAND.lineStrong,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    color: BRAND.ink,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 126, paddingTop: 13, textAlignVertical: 'top' },
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: BRAND.ink,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { transform: [{ scale: 0.99 }] },
  buttonText: { color: BRAND.green, fontSize: 16, fontWeight: '800' },
  wordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordCell: {
    flexBasis: '45%',
    minWidth: 120,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderColor: BRAND.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },
  wordNumber: {
    color: BRAND.muted,
    fontSize: 11,
    minWidth: 18,
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  word: { flex: 1, flexShrink: 1, color: BRAND.ink, fontSize: 14, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BRAND.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: BRAND.ink, borderColor: BRAND.ink },
  checkmark: { color: BRAND.green, fontSize: 14, fontWeight: '900' },
  checkCopy: { flex: 1, color: BRAND.inkSoft, fontSize: 13, lineHeight: 19 },
});
