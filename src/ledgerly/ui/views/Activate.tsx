import { useState } from 'react';
import { useWallet } from '../context';
import { Button, Callout, CopyButton, Dialog, DocLink } from '../components/primitives';
import { QrCode } from '../components/QrCode';
import { XRPL_DOCS } from '../docs';

/**
 * Walks someone through funding a brand new address so the ledger creates it.
 *
 * The QR encodes the plain classic address, which every XRPL wallet and
 * exchange withdrawal scanner understands, so the sending app fills in the
 * destination for them instead of asking them to retype it.
 */
export function ActivateAccount({
  address,
  minimumXrp,
  networkLabel,
  explorerUrl,
  onCheck,
  onClose,
}: {
  address: string;
  minimumXrp: string;
  networkLabel: string;
  explorerUrl: string | null;
  onCheck: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { openExternal } = useWallet();
  const [checking, setChecking] = useState(false);

  return (
    <Dialog title="Activate this account" eyebrow={networkLabel} onClose={onClose}>
      <p className="card-note">
        Send at least {minimumXrp} XRP to the address below from another wallet or an exchange. Once
        it arrives, the ledger creates the account and everything else unlocks.
      </p>

      <QrCode value={address} />

      <div className="address-box">
        <span className="mono">{address}</span>
        <CopyButton value={address} label="Copy address" />
      </div>

      <ol className="activate-steps">
        <li>Open the wallet or exchange holding your XRP, for example Xaman on your phone.</li>
        <li>Start a send or withdrawal and scan the code above, or paste the address.</li>
        <li>
          Enter {minimumXrp} XRP or more, leave the destination tag blank, and confirm on that
          device.
        </li>
        <li>Come back here and check for the funds. It usually lands in a few seconds.</li>
      </ol>

      <Button
        variant="accent"
        block
        loading={checking}
        onClick={() => {
          setChecking(true);
          void Promise.resolve(onCheck()).finally(() => setChecking(false));
        }}
      >
        {checking ? 'Checking the ledger…' : 'I sent it, check now'}
      </Button>

      {explorerUrl ? (
        <button type="button" className="link-button" onClick={() => openExternal(explorerUrl)}>
          View this address on the {networkLabel} explorer
        </button>
      ) : null}

      <DocLink href={XRPL_DOCS.reserves}>Read about account reserves on XRPL.org</DocLink>

      <Callout tone="info" title="Where the first XRP goes">
        The first {minimumXrp} XRP stays with the account as its reserve. You can spend anything
        above that, and you get the reserve back if you ever close the account.
      </Callout>
    </Dialog>
  );
}
