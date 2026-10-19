import { useMemo, useState } from 'react';
import { toXAddress } from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { Callout, CopyButton, Dialog, DocLink, TextField } from '../components/primitives';
import { XRPL_DOCS } from '../docs';
import { QrCode } from '../components/QrCode';
import { explorerAccountUrl } from '../format';

/**
 * Shows the address to share.
 *
 * When a destination tag is entered the QR encodes an X-address rather than the
 * classic address plus a tag written alongside it. The tag is inside the
 * X-address checksum, so a sender cannot drop or mistype it — which is the most
 * common way deposits are lost.
 */
export function Receive({ address, onClose }: { address: string; onClose: () => void }) {
  const { state, openExternal } = useWallet();
  const [tag, setTag] = useState('');

  const shareValue = useMemo(() => {
    const parsed = tag.trim().length > 0 ? Number(tag.trim()) : null;
    if (parsed === null || !Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
      return address;
    }
    try {
      return toXAddress(address, parsed, state.network.isTest);
    } catch {
      return address;
    }
  }, [address, tag, state.network.isTest]);

  const usingXAddress = shareValue !== address;

  return (
    <Dialog title="Receive" eyebrow={state.network.label} onClose={onClose}>
      <QrCode value={shareValue} />

      <div className="address-box">
        <span className="mono">{shareValue}</span>
        <CopyButton value={shareValue} label="Copy address" />
      </div>

      {explorerAccountUrl(state.network, address) ? (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            const url = explorerAccountUrl(state.network, address);
            if (url) openExternal(url);
          }}
        >
          View this address on the {state.network.label} explorer
        </button>
      ) : null}

      <TextField
        label="Destination tag (optional)"
        placeholder="Only if the sender needs one"
        inputMode="numeric"
        autoComplete="off"
        value={tag}
        onChange={(event) => setTag(event.target.value.replace(/[^0-9]/g, ''))}
        hint={
          usingXAddress
            ? 'The code above is an X-address with the tag built in, so it cannot be dropped in transit.'
            : 'Leave blank unless someone asked you for a tag.'
        }
      />

      <DocLink href={XRPL_DOCS.destinationTags}>Read about destination tags on XRPL.org</DocLink>

      {state.network.isTest ? (
        <Callout tone="caution" title={`${state.network.label} address`}>
          This address only works on {state.network.label}. Assets sent from Mainnet will not
          arrive.
        </Callout>
      ) : null}
    </Dialog>
  );
}
