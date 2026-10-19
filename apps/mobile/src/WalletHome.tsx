import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LatestRequest } from '../../../src/ledgerly/native/latestRequest';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  dropsToXrp,
  addDrops,
  formatAmount,
  shortenAddress,
  toXAddress,
  type Contact,
  type HistoryEntry,
  type Portfolio,
  type WalletState,
} from '../../../src/ledgerly/core';
import ledgerlyIcon from '../assets/ledgerly-icon.png';
import { BRAND } from './brand';
import type { NativeWallet } from './wallet';
import { parseDestinationTag } from './destinationTag';
import { WalletManager } from './WalletManager';
import { formatHistoryDate } from './historyDate';
import { Icon, type IconName } from './icons';
import { TokenAvatar } from './TokenAvatar';
import { MarketPanel } from './MarketPanel';
import type { ForegroundWallet } from '../../../src/ledgerly/native/foreground';

type Tab =
  'home' | 'assets' | 'activity' | 'contacts' | 'settings' | 'receive' | 'wallets' | 'market';

interface WalletHomeProps {
  wallet: NativeWallet;
  runSensitive: ForegroundWallet['run'];
  state: WalletState;
  accountEmail: string;
  onStateChanged: () => Promise<void>;
  onLock: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function WalletHome({
  wallet,
  runSensitive,
  state,
  accountEmail,
  onStateChanged,
  onLock,
  onSignOut,
}: WalletHomeProps) {
  const [tab, setTab] = useState<Tab>('home');
  const [portfolioResult, setPortfolio] = useState<{
    scope: string;
    data: Record<string, Portfolio>;
  } | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const account =
    state.accounts.find((candidate) => candidate.id === state.activeAccountId) ?? state.accounts[0];
  const accountId = account?.id;
  const accountIds = JSON.stringify(state.accounts.map((entry) => entry.id).sort());
  const scope = `${state.network.id}:${accountIds}`;
  const requests = useRef(new LatestRequest()).current;
  requests.setScope(scope);
  const portfolios = portfolioResult?.scope === scope ? portfolioResult.data : null;
  const portfolio = accountId ? (portfolios?.[accountId] ?? null) : null;
  const aggregateDrops =
    portfolios && state.accounts.every((entry) => portfolios[entry.id]?.summary)
      ? state.accounts.reduce(
          (total, entry) => addDrops(total, portfolios[entry.id].summary.balanceDrops),
          '0',
        )
      : null;

  const loadPortfolio = useCallback(
    async (refresh = false) => {
      const ids: string[] = JSON.parse(accountIds);
      if (!ids.length) return;
      const current = requests.begin();
      setPortfolioLoading(true);
      setPortfolioError(null);
      try {
        const results = await Promise.allSettled(
          ids.map(
            async (id) => [id, await wallet.getPortfolio({ accountId: id, refresh })] as const,
          ),
        );
        if (current()) {
          const data: Record<string, Portfolio> = {};
          let failed = 0;
          for (const result of results) {
            if (result.status === 'fulfilled') data[result.value[0]] = result.value[1];
            else failed++;
          }
          setPortfolio({ scope, data });
          if (failed)
            setPortfolioError(
              `${failed} wallet balance${failed === 1 ? '' : 's'} could not load. Retry to get a complete total.`,
            );
        }
      } catch (error) {
        if (current()) setPortfolioError(messageOf(error));
      } finally {
        if (current()) setPortfolioLoading(false);
      }
    },
    [accountIds, wallet, scope, requests],
  );

  useEffect(() => {
    setPortfolio(null);
    void loadPortfolio();
    return () => requests.invalidate();
  }, [loadPortfolio, requests]);

  if (!account) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>No wallet account is available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.shell}>
        <Header state={state} accountLabel={account.label} onLock={onLock} />
        {tab === 'market' ? (
          <MarketPanel expanded />
        ) : tab === 'activity' ? (
          <Activity
            key={`${state.network.id}:${account.id}`}
            wallet={wallet}
            state={state}
            accountId={account.id}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {tab === 'home' ? (
              <Dashboard
                state={state}
                accountAddress={account.address}
                portfolio={portfolio}
                aggregateDrops={aggregateDrops}
                loading={portfolioLoading}
                error={portfolioError}
                onRefresh={() => void loadPortfolio(true)}
                onReceive={() => setTab('receive')}
                onOpenAssets={() => setTab('assets')}
                onOpenActivity={() => setTab('activity')}
                onOpenMarket={() => setTab('market')}
                onFund={async () => {
                  await wallet.fundTestAccount({ accountId: account.id });
                  await loadPortfolio(true);
                }}
              />
            ) : null}
            {tab === 'assets' ? (
              <Assets
                state={state}
                portfolio={portfolio}
                loading={portfolioLoading}
                error={portfolioError}
                onRefresh={() => void loadPortfolio(true)}
              />
            ) : null}
            {tab === 'contacts' ? <Contacts wallet={wallet} /> : null}
            {tab === 'settings' ? (
              <>
                <ActionButton label="Manage wallets" onPress={() => setTab('wallets')} />
                <Settings
                  wallet={wallet}
                  state={state}
                  accountEmail={accountEmail}
                  onStateChanged={onStateChanged}
                  onLock={onLock}
                  onSignOut={onSignOut}
                />
              </>
            ) : null}
            {tab === 'wallets' ? (
              <WalletManager
                wallet={wallet}
                state={state}
                runSensitive={runSensitive}
                onStateChanged={onStateChanged}
                onClose={() => setTab('settings')}
                controls={walletControls}
              />
            ) : null}
            {tab === 'receive' ? (
              <Receive
                address={account.address}
                networkLabel={state.network.label}
                isTest={state.network.isTest}
                onDone={() => setTab('home')}
              />
            ) : null}
          </ScrollView>
        )}
        {tab !== 'receive' ? <TabBar selected={tab} onSelect={setTab} /> : null}
      </View>
    </SafeAreaView>
  );
}

function Header({
  state,
  accountLabel,
  onLock,
}: {
  state: WalletState;
  accountLabel: string;
  onLock: () => Promise<void>;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image source={ledgerlyIcon} style={styles.brandIcon} />
        <View>
          <Text style={styles.wordmark}>Ledgerly</Text>
          <Text style={styles.headerMeta}>{accountLabel}</Text>
        </View>
      </View>
      <View style={styles.headerActions}>
        <View style={styles.networkPill}>
          <Icon name="network" size={14} color={BRAND.green} />
          <Text style={styles.networkPillText}>{state.network.label}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void onLock()} style={styles.lockChip}>
          <Text style={styles.lockChipText}>Lock</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Dashboard({
  state,
  accountAddress,
  portfolio,
  aggregateDrops,
  loading,
  error,
  onRefresh,
  onReceive,
  onOpenAssets,
  onOpenActivity,
  onOpenMarket,
  onFund,
}: {
  state: WalletState;
  accountAddress: string;
  portfolio: Portfolio | null;
  aggregateDrops: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onReceive: () => void;
  onOpenAssets: () => void;
  onOpenActivity: () => void;
  onOpenMarket: () => void;
  onFund: () => Promise<void>;
}) {
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const hidden = state.preferences.hideBalances;
  const summary = portfolio?.summary;

  return (
    <View style={styles.stack}>
      <View style={styles.balanceCard}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.eyebrow}>Selected wallet XRP</Text>
          <Pressable onPress={onRefresh} disabled={loading}>
            <Text style={styles.textLink}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>
        {loading && !summary ? <ActivityIndicator color={BRAND.ink} /> : null}
        {error ? <InlineError message={error} onRetry={onRefresh} /> : null}
        {summary ? (
          <>
            <Text style={styles.balanceValue}>
              {hidden ? '••••••' : `${formatAmount(dropsToXrp(summary.balanceDrops), 6)} XRP`}
            </Text>
            <Text style={styles.balanceDetail}>
              {summary.exists
                ? `${hidden ? '••••' : formatAmount(dropsToXrp(summary.spendableDrops), 6)} spendable · ${hidden ? '••••' : formatAmount(dropsToXrp(summary.reserveDrops), 6)} reserved`
                : `This address is not active on ${state.network.label} yet.`}
            </Text>
          </>
        ) : null}
        <Text selectable style={styles.addressBox}>
          {accountAddress}
        </Text>
        {state.network.isTest && state.network.faucet ? (
          <ActionButton
            label={
              funding
                ? 'Requesting test XRP…'
                : summary?.exists
                  ? `Request ${state.network.label} XRP`
                  : `Fund on ${state.network.label}`
            }
            disabled={funding}
            onPress={() => {
              setFunding(true);
              setFundError(null);
              void onFund()
                .catch((cause) => setFundError(messageOf(cause)))
                .finally(() => setFunding(false));
            }}
          />
        ) : null}
        {fundError ? <Text style={styles.errorText}>{fundError}</Text> : null}
        <Text style={styles.balanceDetail}>
          All {state.accounts.length} wallets:{' '}
          {aggregateDrops === null
            ? 'Total unavailable'
            : hidden
              ? '•••••• XRP'
              : `${formatAmount(dropsToXrp(aggregateDrops), 6)} XRP`}
        </Text>
      </View>

      <View style={styles.quickGrid}>
        <QuickAction icon="receive" label="Receive" detail="Share address" onPress={onReceive} />
        <QuickAction icon="coins" label="Assets" detail="XRP and tokens" onPress={onOpenAssets} />
        <QuickAction
          icon="activity"
          label="Activity"
          detail="Ledger history"
          onPress={onOpenActivity}
        />
        <View style={[styles.quickAction, styles.quickActionProtected]}>
          <Icon name="send" color={BRAND.muted} />
          <Text style={styles.quickActionTitle}>Send</Text>
          <Text style={styles.quickActionDetail}>Protected pending signing isolation</Text>
        </View>
      </View>

      <MarketPanel onExplore={onOpenMarket} />

      <Callout title="Native security boundary">
        Balance, assets, receive, history, contacts, networks, and local preferences are available
        now. Sending stays disabled until signing is isolated from the React Native UI runtime.
      </Callout>
    </View>
  );
}

function Assets({
  state,
  portfolio,
  loading,
  error,
  onRefresh,
}: {
  state: WalletState;
  portfolio: Portfolio | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const hidden = state.preferences.hideBalances;
  const summary = portfolio?.summary;
  const tokens = portfolio?.tokens.filter((token) => !token.isObligation) ?? [];

  return (
    <Section title="Assets" eyebrow="Your holdings" action="Refresh" onAction={onRefresh}>
      {loading && !portfolio ? <LoadingLabel label="Loading assets…" /> : null}
      {error ? <InlineError message={error} onRetry={onRefresh} /> : null}
      {summary ? (
        <AssetRow
          badge="XRP"
          title="XRP"
          subtitle={`${hidden ? '••••' : formatAmount(dropsToXrp(summary.spendableDrops), 6)} spendable`}
          value={hidden ? '••••' : formatAmount(dropsToXrp(summary.balanceDrops), 8)}
        />
      ) : null}
      {summary && !summary.exists ? (
        <EmptyCopy>This address is not active on {state.network.label} yet.</EmptyCopy>
      ) : null}
      {summary?.exists && tokens.length === 0 ? (
        <EmptyCopy>No issued tokens are held by this account.</EmptyCopy>
      ) : null}
      {tokens.map((token) => (
        <AssetRow
          key={`${token.currency}-${token.issuer}`}
          badge={token.display.slice(0, 4).toUpperCase()}
          currency={token.currency}
          issuer={token.issuer}
          title={token.display}
          subtitle={`${shortenAddress(token.issuer)} · limit ${formatAmount(token.limit, 4)}`}
          value={hidden ? '••••' : formatAmount(token.balance, 8)}
          danger={token.frozen}
        />
      ))}
    </Section>
  );
}

export function Activity({
  wallet,
  state,
  accountId,
}: {
  wallet: Pick<NativeWallet, 'getHistory'>;
  state: WalletState;
  accountId: string;
}) {
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([]);
  const [marker, setMarker] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requests = useRef(new LatestRequest()).current;
  const scope = `${state.network.id}:${accountId}`;
  requests.setScope(scope);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(), []);
  const renderHistoryEntry = useCallback(
    ({ item }: { item: HistoryEntry }) => <HistoryRow entry={item} dateFormatter={dateFormatter} />,
    [dateFormatter],
  );

  const load = useCallback(
    async (cursor?: unknown, append = false) => {
      const current = requests.begin();
      setLoading(true);
      setError(null);
      try {
        const result = await wallet.getHistory({
          accountId,
          ...(cursor === undefined ? {} : { marker: cursor }),
        });
        if (!current()) return;
        setEntries((current) => (append ? [...current, ...result.entries] : result.entries));
        setMarker(result.marker);
      } catch (cause) {
        if (current()) setError(messageOf(cause));
      } finally {
        if (current()) setLoading(false);
      }
    },
    [accountId, wallet, requests],
  );

  useEffect(() => {
    setEntries([]);
    setMarker(undefined);
    void load();
    return () => requests.invalidate();
  }, [load, requests, scope]);

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      data={entries}
      keyExtractor={historyKey}
      renderItem={renderHistoryEntry}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      ListHeaderComponent={
        <Section
          title="Activity"
          eyebrow={state.network.label}
          action="Refresh"
          onAction={() => void load()}
        >
          {loading && entries.length === 0 ? <LoadingLabel label="Loading activity…" /> : null}
          {error ? <InlineError message={error} onRetry={() => void load()} /> : null}
          {!loading && !error && entries.length === 0 ? (
            <EmptyCopy>No transactions on this network yet.</EmptyCopy>
          ) : null}
        </Section>
      }
      ListFooterComponent={
        marker !== undefined ? (
          <ActionButton
            label={loading ? 'Loading…' : 'Load more'}
            disabled={loading}
            onPress={() => void load(marker, true)}
            secondary
          />
        ) : null
      }
    />
  );
}

const historyKey = (entry: HistoryEntry) => entry.hash;
function HistoryRow({
  entry,
  dateFormatter,
}: {
  entry: HistoryEntry;
  dateFormatter: Intl.DateTimeFormat;
}) {
  return (
    <View style={styles.activityRow}>
      <View style={styles.directionBadge}>
        <Icon name={entry.direction === 'in' ? 'receive' : 'send'} size={22} />
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{entry.headline}</Text>
        <Text style={styles.rowSubtitle}>
          {entry.counterparty ? shortenAddress(entry.counterparty) : entry.type}
          {formatHistoryDate(entry.timestamp, dateFormatter)}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={[styles.rowValue, !entry.succeeded && styles.dangerText]}>
          {entry.amount ?? '—'}
        </Text>
        <Text style={styles.rowSubtitle}>{entry.succeeded ? `${entry.feeXrp} fee` : 'Failed'}</Text>
      </View>
    </View>
  );
}

function Receive({
  address,
  networkLabel,
  isTest,
  onDone,
}: {
  address: string;
  networkLabel: string;
  isTest: boolean;
  onDone: () => void;
}) {
  const [tag, setTag] = useState('');
  const { shareAddress, tagError } = useMemo(() => {
    try {
      const parsed = parseDestinationTag(tag);
      return {
        shareAddress: parsed === undefined ? address : toXAddress(address, parsed, isTest),
        tagError: null,
      };
    } catch (cause) {
      return { shareAddress: null, tagError: messageOf(cause) };
    }
  }, [address, isTest, tag]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Section title="Receive" eyebrow={networkLabel}>
        <View style={styles.receiveMark}>
          <Image source={ledgerlyIcon} style={styles.receiveIcon} />
          <Text style={styles.receiveMarkText}>Ledgerly address</Text>
        </View>
        <Text selectable={shareAddress !== null} style={styles.receiveAddress}>
          {shareAddress ?? 'Enter a valid destination tag to show your receiving address.'}
        </Text>
        <Field
          label="Destination tag (optional)"
          value={tag}
          onChangeText={setTag}
          keyboardType="number-pad"
          placeholder="Only if the sender needs one"
        />
        {tagError ? <Text style={styles.errorText}>{tagError}</Text> : null}
        {!tagError ? (
          <Text style={styles.hint}>
            {shareAddress === address
              ? 'Leave blank unless the sender requires a destination tag.'
              : 'The destination tag is encoded into this X-address so it cannot be dropped.'}
          </Text>
        ) : null}
        {isTest ? (
          <Callout title={`${networkLabel} only`}>
            Assets sent from Mainnet to this test-network address will not arrive.
          </Callout>
        ) : null}
        <ActionButton
          label="Share address"
          disabled={!shareAddress}
          onPress={() => {
            if (!shareAddress) return;
            void Share.share({ message: shareAddress }).catch((cause) =>
              Alert.alert('Could not share address', messageOf(cause)),
            );
          }}
        />
        <ActionButton label="Done" onPress={onDone} secondary />
      </Section>
    </KeyboardAvoidingView>
  );
}

function Contacts({ wallet }: { wallet: NativeWallet }) {
  const [contacts, setContacts] = useState<readonly Contact[]>([]);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setContacts(await wallet.listContacts()), [wallet]);
  useEffect(() => {
    void load().catch((cause) => setError(messageOf(cause)));
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const destinationTag = parseDestinationTag(tag);
      await wallet.saveContact({
        label,
        address,
        ...(destinationTag === undefined ? {} : { destinationTag }),
      });
      setLabel('');
      setAddress('');
      setTag('');
      setEditing(false);
      await load();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Contacts"
      eyebrow="Address book"
      action={editing ? 'Cancel' : 'Add'}
      onAction={() => setEditing((value) => !value)}
    >
      {editing ? (
        <View style={styles.formStack}>
          <Field label="Name" value={label} onChangeText={setLabel} placeholder="Contact name" />
          <Field
            label="XRPL address or X-address"
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="r… or X…"
          />
          <Field
            label="Destination tag (optional)"
            value={tag}
            onChangeText={setTag}
            keyboardType="number-pad"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <ActionButton
            label={busy ? 'Saving…' : 'Save contact'}
            disabled={busy || !label.trim() || !address.trim()}
            onPress={() => void save()}
          />
        </View>
      ) : null}
      {!editing && contacts.length === 0 ? (
        <EmptyCopy>No saved contacts yet. Add frequently used XRPL addresses here.</EmptyCopy>
      ) : null}
      {contacts.map((contact) => (
        <View key={contact.id} style={styles.contactRow}>
          <View style={styles.contactAvatar}>
            <Text style={styles.contactInitial}>{contact.label.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{contact.label}</Text>
            <Text style={styles.rowSubtitle}>
              {shortenAddress(contact.address)}
              {contact.destinationTag === undefined ? '' : ` · tag ${contact.destinationTag}`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert('Remove contact?', `${contact.label} will be removed from this wallet.`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () =>
                    void wallet
                      .removeContact({ id: contact.id })
                      .then(load)
                      .catch((cause) => setError(messageOf(cause))),
                },
              ])
            }
            style={styles.smallButton}
          >
            <Text style={styles.smallButtonText}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </Section>
  );
}

function Settings({
  wallet,
  state,
  accountEmail,
  onStateChanged,
  onLock,
  onSignOut,
}: {
  wallet: NativeWallet;
  state: WalletState;
  accountEmail: string;
  onStateChanged: () => Promise<void>;
  onLock: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onStateChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSignOut();
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  };

  return (
    <View style={styles.stack}>
      <Section title="Wallets" eyebrow="Active account">
        {state.accounts.map((account) => (
          <Pressable
            key={account.id}
            disabled={busy}
            onPress={() => void change(() => wallet.selectAccount({ accountId: account.id }))}
            style={[
              styles.choiceRow,
              state.activeAccountId === account.id && styles.choiceRowSelected,
            ]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{account.label}</Text>
              <Text style={styles.rowSubtitle}>{shortenAddress(account.address, 8, 6)}</Text>
            </View>
            <Text style={styles.choiceStatus}>
              {state.activeAccountId === account.id ? 'Active' : 'Select'}
            </Text>
          </Pressable>
        ))}
      </Section>

      <Section title="Network" eyebrow="XRP Ledger">
        {state.networks.map((network) => (
          <Pressable
            key={network.id}
            disabled={busy}
            onPress={() => void change(() => wallet.setNetwork({ networkId: network.id }))}
            style={[styles.choiceRow, state.network.id === network.id && styles.choiceRowSelected]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{network.label}</Text>
              <Text style={styles.rowSubtitle}>
                {network.isTest ? 'Test network' : 'Live network'}
              </Text>
            </View>
            <Text style={styles.choiceStatus}>
              {state.network.id === network.id ? 'Active' : 'Use'}
            </Text>
          </Pressable>
        ))}
        <SettingToggle
          label="Show test networks"
          value={state.preferences.showTestNetworks}
          disabled={busy}
          onValueChange={(value) =>
            void change(async () => {
              if (!value && state.network.isTest) {
                await wallet.setNetwork({ networkId: 'mainnet' });
              }
              await wallet.setPreferences({ showTestNetworks: value });
            })
          }
        />
      </Section>

      <Section title="Privacy" eyebrow="Display and lock">
        <SettingToggle
          label="Hide balances"
          value={state.preferences.hideBalances}
          disabled={busy}
          onValueChange={(value) =>
            void change(() => wallet.setPreferences({ hideBalances: value }))
          }
        />
        <Text style={styles.fieldLabel}>Auto-lock</Text>
        <View style={styles.optionRow}>
          {[5, 15, 30, 60].map((minutes) => (
            <Pressable
              key={minutes}
              disabled={busy}
              onPress={() => void change(() => wallet.setPreferences({ autoLockMinutes: minutes }))}
              style={[
                styles.optionChip,
                state.preferences.autoLockMinutes === minutes && styles.optionChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.optionChipText,
                  state.preferences.autoLockMinutes === minutes && styles.optionChipTextSelected,
                ]}
              >
                {minutes}m
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          Ledgerly also locks immediately whenever the app backgrounds.
        </Text>
      </Section>

      <Section title="Ledgerly account" eyebrow="Cloud sign-in">
        <View style={styles.choiceRow}>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>Signed in</Text>
            <Text style={styles.rowSubtitle}>{accountEmail}</Text>
          </View>
        </View>
        <Text style={styles.hint}>
          Account authentication and the encrypted wallet vault are separate security layers.
        </Text>
        <ActionButton label="Sign out" disabled={busy} onPress={() => void signOut()} secondary />
      </Section>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ActionButton label="Lock wallet now" onPress={() => void onLock()} secondary />
      <Callout title="Keys stay local">
        Recovery phrases, private keys, and your wallet password stay on this device. Your Ledgerly
        profile uses a separate online sign-in.
      </Callout>
    </View>
  );
}

function TabBar({ selected, onSelect }: { selected: Tab; onSelect: (tab: Tab) => void }) {
  const tabs: readonly { key: Tab; label: string; icon: IconName }[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'assets', label: 'Assets', icon: 'coins' },
    { key: 'activity', label: 'Activity', icon: 'activity' },
    { key: 'contacts', label: 'Contacts', icon: 'contacts' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === tab.key }}
          key={tab.key}
          onPress={() => onSelect(tab.key)}
          style={[styles.tab, selected === tab.key && styles.tabSelected]}
        >
          <Icon
            name={tab.icon}
            size={21}
            color={selected === tab.key ? BRAND.green : BRAND.muted}
          />
          <Text
            maxFontSizeMultiplier={1.6}
            style={[styles.tabText, selected === tab.key && styles.tabTextSelected]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Section({
  title,
  eyebrow,
  action,
  onAction,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeadingRow}>
        <Icon name={sectionIcons[title] ?? 'wallet'} />
        <View style={styles.rowMain}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {action && onAction ? (
          <Pressable onPress={onAction} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const sectionIcons: Record<string, IconName> = {
  Assets: 'coins',
  Activity: 'activity',
  Receive: 'receive',
  Contacts: 'contacts',
  Network: 'network',
  Privacy: 'shield',
  'Ledgerly account': 'user',
};

function QuickAction({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: IconName;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <Icon name={icon} />
      <Text style={styles.quickActionTitle}>{label}</Text>
      <Text style={styles.quickActionDetail}>{detail}</Text>
    </Pressable>
  );
}

function AssetRow({
  badge,
  title,
  subtitle,
  value,
  danger = false,
  currency,
  issuer,
}: {
  badge: string;
  title: string;
  subtitle: string;
  value: string;
  danger?: boolean;
  currency?: string;
  issuer?: string;
}) {
  return (
    <View style={styles.assetRow}>
      <TokenAvatar
        currency={currency ?? (badge === 'XRP' ? 'XRP' : '')}
        issuer={issuer ?? null}
        symbol={title}
      />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={[styles.rowValue, danger && styles.dangerText]}>{value}</Text>
    </View>
  );
}

function SettingToggle({
  label,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.rowTitle}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: BRAND.lineStrong, true: BRAND.green }}
        thumbColor={BRAND.ink}
      />
    </View>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={BRAND.muted}
        style={styles.input}
      />
    </View>
  );
}

const walletControls = { Field, Button: ActionButton };

function ActionButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        secondary && styles.actionButtonSecondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.inlineError}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry}>
        <Text style={styles.textLink}>Try again</Text>
      </Pressable>
    </View>
  );
}

function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.callout}>
      <Text style={styles.calloutTitle}>{title}</Text>
      <Text style={styles.calloutCopy}>{children}</Text>
    </View>
  );
}

function EmptyCopy({ children }: { children: ReactNode }) {
  return <Text style={styles.emptyCopy}>{children}</Text>;
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator color={BRAND.ink} />
      <Text style={styles.rowSubtitle}>{label}</Text>
    </View>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BRAND.cream },
  shell: { flex: 1, backgroundColor: BRAND.cream },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    minHeight: 74,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomColor: BRAND.line,
    borderBottomWidth: 1,
    backgroundColor: BRAND.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brandIcon: { width: 40, height: 40, borderRadius: 10 },
  wordmark: {
    color: BRAND.ink,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 22,
    fontWeight: '700',
  },
  headerMeta: { color: BRAND.muted, fontSize: 11, marginTop: 1 },
  headerActions: { alignItems: 'flex-end', gap: 5 },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.ink,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
  },
  networkDot: { width: 7, height: 7, borderRadius: 4 },
  networkPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  lockChip: { paddingHorizontal: 9, paddingVertical: 3 },
  lockChipText: { color: BRAND.ink, fontSize: 11, fontWeight: '800' },
  content: { padding: 18, paddingBottom: 32 },
  stack: { gap: 16 },
  balanceCard: {
    padding: 22,
    borderRadius: 24,
    backgroundColor: BRAND.ink,
    gap: 14,
  },
  eyebrow: {
    color: BRAND.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  balanceValue: {
    color: BRAND.green,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 38,
    fontWeight: '700',
  },
  balanceDetail: { color: '#C9CEC9', fontSize: 13, lineHeight: 19 },
  addressBox: {
    color: '#FFFFFF',
    backgroundColor: '#252A27',
    borderRadius: 12,
    padding: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 11,
    lineHeight: 17,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAction: {
    width: '48%',
    flexGrow: 1,
    minHeight: 96,
    borderRadius: 18,
    padding: 16,
    backgroundColor: BRAND.paper,
    borderColor: BRAND.line,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  quickActionProtected: { backgroundColor: '#EEEEE8' },
  quickActionTitle: {
    color: BRAND.ink,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 20,
    fontWeight: '700',
  },
  quickActionDetail: { color: BRAND.muted, fontSize: 12, lineHeight: 17 },
  callout: { backgroundColor: BRAND.green, borderRadius: 18, padding: 18, gap: 6 },
  calloutTitle: { color: BRAND.ink, fontSize: 16, fontWeight: '900' },
  calloutCopy: { color: BRAND.inkSoft, fontSize: 13, lineHeight: 19 },
  section: {
    borderRadius: 22,
    borderColor: BRAND.line,
    borderWidth: 1,
    backgroundColor: BRAND.paper,
    padding: 18,
    gap: 14,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: BRAND.ink,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 28,
    fontWeight: '700',
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopColor: BRAND.line,
    borderTopWidth: 1,
  },
  assetBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.ink,
  },
  assetBadgeText: { color: BRAND.green, fontSize: 10, fontWeight: '900' },
  rowMain: { flex: 1, gap: 3 },
  rowEnd: { alignItems: 'flex-end', gap: 3 },
  rowTitle: { color: BRAND.ink, fontSize: 14, fontWeight: '800' },
  rowSubtitle: { color: BRAND.muted, fontSize: 11, lineHeight: 16 },
  rowValue: { color: BRAND.ink, fontSize: 14, fontWeight: '900' },
  dangerText: { color: BRAND.danger },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopColor: BRAND.line,
    borderTopWidth: 1,
  },
  directionBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.cream,
  },
  receiveMark: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  receiveIcon: { width: 84, height: 84, borderRadius: 20 },
  receiveMarkText: { color: BRAND.muted, fontSize: 12, fontWeight: '800' },
  receiveAddress: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: BRAND.cream,
    color: BRAND.ink,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 13,
    lineHeight: 20,
  },
  formStack: { gap: 12 },
  field: { gap: 7 },
  fieldLabel: { color: BRAND.ink, fontSize: 13, fontWeight: '800' },
  input: {
    minHeight: 50,
    borderColor: BRAND.lineStrong,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    color: BRAND.ink,
    fontSize: 15,
  },
  hint: { color: BRAND.muted, fontSize: 12, lineHeight: 18 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopColor: BRAND.line,
    borderTopWidth: 1,
  },
  contactAvatar: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: BRAND.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: { color: '#FFFFFF', fontWeight: '900' },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 14,
    borderColor: BRAND.line,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  choiceRowSelected: { borderColor: BRAND.ink, backgroundColor: BRAND.cream },
  choiceStatus: { color: BRAND.ink, fontSize: 12, fontWeight: '900' },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderColor: BRAND.lineStrong,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  optionChipSelected: { backgroundColor: BRAND.ink, borderColor: BRAND.ink },
  optionChipText: { color: BRAND.ink, fontSize: 12, fontWeight: '800' },
  optionChipTextSelected: { color: BRAND.green },
  actionButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: BRAND.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionButtonSecondary: {
    backgroundColor: BRAND.cream,
    borderColor: BRAND.lineStrong,
    borderWidth: 1,
  },
  actionButtonText: { color: BRAND.green, fontSize: 14, fontWeight: '900' },
  actionButtonTextSecondary: { color: BRAND.ink },
  smallButton: {
    borderColor: BRAND.lineStrong,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  smallButtonText: { color: BRAND.ink, fontSize: 11, fontWeight: '800' },
  textLink: { color: BRAND.purple, fontSize: 12, fontWeight: '900' },
  errorText: { color: BRAND.danger, fontSize: 12, lineHeight: 18 },
  inlineError: { backgroundColor: '#FDF0EE', borderRadius: 12, padding: 12, gap: 8 },
  emptyCopy: {
    color: BRAND.muted,
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 12,
    textAlign: 'center',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  tabBar: {
    minHeight: 76,
    flexDirection: 'row',
    borderTopColor: BRAND.line,
    borderTopWidth: 1,
    backgroundColor: BRAND.paper,
    paddingHorizontal: 7,
    paddingTop: 7,
    paddingBottom: Platform.OS === 'ios' ? 8 : 7,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 6,
    gap: 4,
  },
  tabSelected: { backgroundColor: BRAND.ink },
  tabText: { color: BRAND.muted, fontSize: 10, fontWeight: '800' },
  tabTextSelected: { color: BRAND.green },
  title: { color: BRAND.ink, fontSize: 28, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.99 }] },
});
