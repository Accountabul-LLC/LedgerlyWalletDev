import { Text } from 'react-native';
import { useEffect, useState } from 'react';
import { dropsToXrp, formatAmount, shortenAddress, type Portfolio } from '@ledgerly/core/shared';
import { useWallet } from '../../wallet';
import { Callout, Card, Note, Row, Screen, Title } from '../../ui';
import { ledgerAssetLabel } from '../../format';
import { TokenAvatar } from '../../token-avatar';
import { MarketCredit } from '../../market-ui';
import { colors } from '../../theme';

export default function TokensScreen() {
  const { wallet, state } = useWallet();
  const accountId = state.activeAccountId;
  const [result, setPortfolio] = useState<{ scope: string; portfolio: Portfolio } | null>(null);
  const scope = `${state.network.id}:${accountId ?? ''}`;
  const portfolio = result?.scope === scope ? result.portfolio : null;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    setLoading(true);
    setError(null);
    void wallet
      .getPortfolio({ accountId })
      .then((portfolio) => {
        if (!active) return;
        setPortfolio({ scope, portfolio });
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Could not load tokens.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountId, scope, wallet]);

  if (!accountId) {
    return (
      <Screen>
        <Title>Assets</Title>
        <Note>No account selected.</Note>
      </Screen>
    );
  }

  const activated = portfolio?.summary.exists === true;
  const tokens = activated ? (portfolio?.tokens ?? []).filter((token) => !token.isObligation) : [];
  const unavailable = !loading && error !== null && portfolio === null;
  const spendable = portfolio ? dropsToXrp(portfolio.summary.spendableDrops) : '0';
  const total = portfolio ? dropsToXrp(portfolio.summary.balanceDrops) : '0';
  const hidden = state.preferences.hideBalances;
  const totalLabel = hidden ? '••••' : !portfolio ? (unavailable ? '—' : '…') : formatAmount(total);

  return (
    <Screen>
      <Title>Assets</Title>
      <Note>Holdings on this phone for the selected wallet.</Note>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Card>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{state.network.label}</Text>
        <Text style={{ fontFamily: 'Georgia', fontSize: 36, color: colors.ink }}>
          {totalLabel} <Text style={{ fontSize: 18 }}>XRP</Text>
        </Text>
      </Card>
      <Card>
        <Row
          leading={<TokenAvatar currency="XRP" issuer={null} />}
          title={ledgerAssetLabel('XRP')}
          subtitle={
            hidden
              ? 'Reserved'
              : unavailable
                ? 'Could not load this balance'
                : 'Spendable after reserve'
          }
          value={
            hidden ? '••••' : portfolio ? `${formatAmount(spendable)} XRP` : unavailable ? '—' : '…'
          }
        />
      </Card>
      {tokens.map((token) => (
        <Card key={`${token.currency}-${token.issuer}`}>
          <Row
            leading={<TokenAvatar currency={token.currency} issuer={token.issuer} />}
            title={ledgerAssetLabel(token.display)}
            subtitle={shortenAddress(token.issuer)}
            value={
              hidden
                ? '••••'
                : `${formatAmount(token.balance, 8)} ${ledgerAssetLabel(token.display)}`
            }
          />
          {token.frozen ? <Text style={{ color: colors.danger }}>Frozen</Text> : null}
        </Card>
      ))}
      {activated && tokens.length === 0 ? (
        <Callout title="No issued tokens yet">
          You can add a trust line from the web wallet.
        </Callout>
      ) : null}
      {tokens.length > 0 ? <MarketCredit /> : null}
    </Screen>
  );
}
