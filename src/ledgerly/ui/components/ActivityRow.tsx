import { shortenAddress, type Contact, type HistoryEntry } from '@ledgerly/core/shared';
import { ExternalIcon, ReceiveIcon, SendIcon } from './icons';
import { formatRelativeTime } from '../format';
import { directionWord, resolveName } from '../names';
import { isFaucetAddress } from '../faucet-sources';

interface NamedAccount {
  readonly label: string;
  readonly address: string;
}

/**
 * One line of history, shared by the Activity tab and the Recent activity
 * panel on Home so the two can never drift apart.
 */
export function ActivityRow({
  entry,
  accounts,
  contacts,
  networkId,
  networkLabel,
  showFee = false,
  onOpen,
  onSaveContact,
}: {
  entry: HistoryEntry;
  accounts: readonly NamedAccount[];
  contacts?: readonly Contact[];
  networkId: string;
  networkLabel: string;
  showFee?: boolean;
  onOpen?: () => void;
  onSaveContact?: (address: string) => void;
}) {
  const isPayment = entry.type === 'Payment';
  const party = resolveName(entry.counterparty, accounts, contacts ?? []);
  const faucet = entry.direction === 'in' && isFaucetAddress(networkId, entry.counterparty);
  const headline =
    isPayment && entry.counterparty && party
      ? `${entry.headline} ${directionWord(entry.direction)} ${party.name}`
      : entry.headline;

  const meta = [
    entry.counterparty ? shortenAddress(entry.counterparty) : entry.type,
    formatRelativeTime(entry.timestamp),
    showFee ? `fee ${entry.feeXrp} XRP` : null,
  ].filter(Boolean) as string[];

  const canSave =
    onSaveContact !== undefined && isPayment && !!entry.counterparty && !party && !faucet;

  return (
    <div className="row activity-row">
      <button
        type="button"
        className="activity-row-open"
        onClick={onOpen}
        disabled={onOpen === undefined}
      >
        <span className="row-badge">
          {entry.direction === 'in' ? <ReceiveIcon /> : <SendIcon />}
        </span>
        <span className="row-main">
          <strong>
            {headline}
            {party?.kind === 'own' ? <span className="party-chip">Your wallet</span> : null}
            {faucet ? <span className="verified-chip">Official {networkLabel} faucet</span> : null}
          </strong>
          <span>{meta.join(' · ')}</span>
        </span>
        <span className="row-end">
          <strong className={entry.direction === 'in' && entry.succeeded ? 'positive' : ''}>
            {entry.amount ?? '—'}
          </strong>
          <span style={entry.succeeded ? undefined : { color: 'var(--danger)' }}>
            {entry.succeeded ? (
              onOpen ? (
                <ExternalIcon style={{ width: 12, height: 12 }} />
              ) : null
            ) : (
              'Failed'
            )}
          </span>
        </span>
      </button>

      {canSave ? (
        <button
          type="button"
          className="link-button activity-row-save"
          onClick={() => onSaveContact?.(entry.counterparty!)}
        >
          Save as contact
        </button>
      ) : null}
    </div>
  );
}
