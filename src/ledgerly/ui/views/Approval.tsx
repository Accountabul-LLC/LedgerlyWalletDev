import { useState } from 'react';
import { highestRisk, shortenAddress, type ApprovalRequest } from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { useAsyncAction } from '../store';
import { Button, Callout, DetailList, RiskFindings } from '../components/primitives';
import { AlertIcon, ShieldIcon } from '../components/icons';

/**
 * The approval screen.
 *
 * Everything a site asked for ends here, and nothing is pre-selected in the
 * site's favour: the confirm button carries the risk level of the request, and
 * a `danger` finding forces an extra deliberate click rather than being a
 * colour change the user can skim past.
 */
export function Approval({
  request,
  onResolved,
  interactive = true,
}: {
  request: ApprovalRequest;
  onResolved: () => void;
  /** False while a newly shown request is still settling, to absorb stray clicks. */
  interactive?: boolean;
}) {
  return request.kind === 'connect' ? (
    <ConnectApproval request={request} onResolved={onResolved} interactive={interactive} />
  ) : (
    <SignApproval request={request} onResolved={onResolved} interactive={interactive} />
  );
}

function ConnectApproval({
  request,
  onResolved,
  interactive,
}: {
  request: Extract<ApprovalRequest, { kind: 'connect' }>;
  onResolved: () => void;
  interactive: boolean;
}) {
  const { wallet, state } = useWallet();
  const [selected, setSelected] = useState<string[]>(
    state.activeAccountId ? [state.activeAccountId] : [],
  );

  const respond = useAsyncAction(async (approved: boolean) => {
    await wallet.resolveApproval({
      id: request.id,
      approved,
      ...(approved ? { accountIds: selected } : {}),
    });
    onResolved();
  });

  const risk = highestRisk(request.findings);

  return (
    <div className="stack">
      <div style={{ textAlign: 'center' }}>
        <span className="brand-mark" style={{ margin: '0 auto' }}>
          L
        </span>
        <h2 style={{ marginTop: 14 }}>Connect to this site?</h2>
      </div>

      <div className="origin-chip">
        {risk === 'danger' ? <AlertIcon /> : <ShieldIcon />}
        {request.hostname}
      </div>

      <RiskFindings findings={request.findings} />

      <div>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          Share these accounts
        </p>
        {state.accounts.map((account) => (
          <label className="checkbox-row" key={account.id}>
            <input
              type="checkbox"
              checked={selected.includes(account.id)}
              onChange={(event) => {
                setSelected((current) =>
                  event.target.checked
                    ? [...current, account.id]
                    : current.filter((id) => id !== account.id),
                );
              }}
            />
            <span style={{ flex: 1 }}>
              <strong style={{ display: 'block', fontSize: 13 }}>{account.label}</strong>
              <span className="mono" style={{ color: 'var(--faint)', fontSize: 11 }}>
                {shortenAddress(account.address, 10, 6)}
              </span>
            </span>
          </label>
        ))}
      </div>

      <Callout tone="info">
        This site will be able to see the balances of the accounts you share and to ask you to sign
        transactions. It can never move funds without an approval like this one.
      </Callout>

      {respond.error ? <Callout tone="danger">{respond.error}</Callout> : null}

      <div className="button-row">
        <Button
          variant="secondary"
          disabled={respond.pending || !interactive}
          onClick={() => void respond.run(false).catch(() => undefined)}
        >
          Reject
        </Button>
        <Button
          variant={risk === 'danger' ? 'danger' : 'accent'}
          loading={respond.pending}
          disabled={selected.length === 0 || !interactive}
          onClick={() => void respond.run(true).catch(() => undefined)}
        >
          Connect
        </Button>
      </div>
    </div>
  );
}

function SignApproval({
  request,
  onResolved,
  interactive,
}: {
  request: Extract<ApprovalRequest, { kind: 'signTransaction' }>;
  onResolved: () => void;
  interactive: boolean;
}) {
  const { wallet, state } = useWallet();
  const [acknowledged, setAcknowledged] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const respond = useAsyncAction(async (approved: boolean) => {
    await wallet.resolveApproval({ id: request.id, approved });
    onResolved();
  });

  const risk = highestRisk(request.description.findings);
  const account = state.accounts.find((candidate) => candidate.id === request.accountId);
  const needsAcknowledgement = risk === 'danger';

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">{request.submit ? 'Sign and submit' : 'Signature request'}</p>
        <h2 style={{ marginTop: 6 }}>{request.description.headline}</h2>
        <p className="inline-note" style={{ marginTop: 6 }}>
          {request.description.summary}
        </p>
      </div>

      <div className="origin-chip">
        {risk === 'danger' ? <AlertIcon /> : <ShieldIcon />}
        {request.hostname}
      </div>

      <DetailList
        items={[
          {
            label: 'Account',
            value: `${account?.label ?? 'Unknown'} · ${shortenAddress(request.address)}`,
          },
          { label: 'Network', value: state.network.label },
          ...request.description.fields.map((field) => ({
            label: field.label,
            value: field.mono ? <span className="mono">{field.value}</span> : field.value,
          })),
        ]}
      />

      <RiskFindings findings={request.description.findings} />

      <button className="link-button" onClick={() => setShowRaw((current) => !current)}>
        {showRaw ? 'Hide' : 'Show'} raw transaction
      </button>

      {showRaw ? (
        <pre
          className="mono"
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 12,
            background: 'var(--surface-sunken)',
            border: '1px solid var(--line)',
            fontSize: 10.5,
            lineHeight: 1.5,
            maxHeight: 200,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {JSON.stringify(request.transaction, null, 2)}
        </pre>
      ) : null}

      {needsAcknowledgement ? (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          I understand the risk described above and want to proceed.
        </label>
      ) : null}

      {respond.error ? <Callout tone="danger">{respond.error}</Callout> : null}

      <div className="button-row">
        <Button
          variant="secondary"
          disabled={respond.pending || !interactive}
          onClick={() => void respond.run(false).catch(() => undefined)}
        >
          Reject
        </Button>
        <Button
          variant={needsAcknowledgement ? 'danger' : 'accent'}
          loading={respond.pending}
          disabled={!interactive || (needsAcknowledgement && !acknowledged)}
          onClick={() => void respond.run(true).catch(() => undefined)}
        >
          {request.submit ? 'Sign and submit' : 'Sign'}
        </Button>
      </div>
    </div>
  );
}
