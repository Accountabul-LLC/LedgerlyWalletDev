import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as shared from '@/ledgerly/core/shared';
import { findRecipients, parseRecipientTag } from '@/ledgerly/ui/recipients';
import { WalletEngine } from '@/ledgerly/core/engine/engine';
import { MemoryStore } from '@/ledgerly/core/storage/ports';
import { MemorySessionStore } from '@/ledgerly/core/storage/session';
import type { AccountView, Contact } from '@/ledgerly/core/shared';
const require = createRequire(import.meta.url);
const { compile, hooks, jsx, tick } = require('../../apps/mobile/test/harness.cjs');
const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const own = { id: 'own', label: 'Savings wallet', address } as AccountView;
const contact = {
  id: 'saved',
  label: 'Exchange deposit',
  address,
  destinationTag: 0,
  note: 'Trading account',
} satisfies Contact;

describe('recipient suggestions and contact validation', () => {
  it('finds local wallets by name and address with source context', () => {
    expect(findRecipients('SAVINGS', [own], [contact])[0]).toMatchObject({
      label: own.label,
      address,
      source: 'wallet',
    });
    expect(findRecipients(address.slice(0, 10), [own], [contact])).toHaveLength(2);
    expect(findRecipients('deposit', [own], [contact])[0]).toMatchObject({
      destinationTag: 0,
      note: contact.note,
      source: 'contact',
    });
  });

  it('omits non-XRPL addresses and invalid saved destination tags', () => {
    expect(
      findRecipients(
        'bad',
        [],
        [
          { id: 'a', label: 'bad ethereum', address: '0x123' },
          { ...contact, label: 'bad tag', destinationTag: -1 },
        ],
      ),
    ).toEqual([]);
  });

  it('deduplicates matching wallet/contact destinations but keeps distinct tags', () => {
    expect(
      findRecipients(
        'wallet',
        [own],
        [{ ...contact, label: 'Saved wallet', destinationTag: undefined }],
      ),
    ).toHaveLength(1);
    expect(findRecipients('wallet', [own], [{ ...contact, label: 'Tagged wallet' }])).toHaveLength(
      2,
    );
  });

  it('extracts X-address tag zero instead of trusting stale optional tag metadata', () => {
    const x = shared.toXAddress(address, 0, false);
    expect(
      findRecipients('exchange', [], [{ ...contact, address: x, destinationTag: 42 }])[0]
        ?.destinationTag,
    ).toBe(0);
  });

  it.each(['-1', '1.2', '1e3', '4294967296', 'NaN'])('rejects invalid tag %s', (tag) => {
    expect(() => parseRecipientTag(tag)).toThrow();
  });

  it('preserves optional tags, zero and the maximum tag', () => {
    expect(parseRecipientTag('')).toBeUndefined();
    expect(parseRecipientTag('0')).toBe(0);
    expect(parseRecipientTag('4294967295')).toBe(4294967295);
  });

  it('rejects bad addresses and tags in the engine before any encrypted contact mutation', async () => {
    const engine = new WalletEngine({
      store: new MemoryStore(),
      session: new MemorySessionStore(),
      version: 'test',
    });
    const mutate = vi
      .spyOn(engine as unknown as { mutatePayload: () => Promise<void> }, 'mutatePayload')
      .mockResolvedValue(undefined);
    await expect(engine.saveContact({ label: 'Invalid', address: '0x123' })).rejects.toThrow(
      'valid XRP Ledger address',
    );
    for (const destinationTag of [-1, 1.5, 4294967296]) {
      await expect(
        engine.saveContact({ label: 'Invalid', address, destinationTag }),
      ).rejects.toThrow('Destination tag');
    }
    expect(mutate).not.toHaveBeenCalled();
    expect(
      await engine.saveContact({ label: 'Zero', address, destinationTag: 0, note: 'Note' }),
    ).toMatchObject({ address, destinationTag: 0, note: 'Note' });
  });
});

// The JSX fixture contains heterogeneous component props, as in the existing UI harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tree = { type: unknown; props: Record<string, any> };
function find(node: Tree | undefined, match: (node: Tree) => boolean): Tree | undefined {
  if (!node || typeof node !== 'object') return;
  if (match(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, match);
    if (result) return result;
  }
}

it('fills Contacts from a saved recipient, preserves tag zero/note, and blocks invalid edits', async () => {
  const h = hooks();
  const saveContact = vi.fn(async () => ({}));
  const component = compile(resolve('src/ledgerly/ui/views/Contacts.tsx'), {
    react: h.react,
    'react/jsx-runtime': jsx,
    '@ledgerly/core/shared': shared,
    '../context': { useWallet: () => ({ state: { accounts: [own] }, wallet: { saveContact } }) },
    '../store': {
      useAsyncData: () => ({ data: [contact] }),
      useAsyncAction: (fn: () => Promise<void>) => ({ run: fn, pending: false, error: null }),
    },
    '../components/primitives': Object.fromEntries(
      ['Button', 'Callout', 'Dialog', 'EmptyState', 'Panel', 'TextField'].map((x) => [x, x]),
    ),
    '../components/icons': {},
    '../format': { initialsOf: () => '' },
    '../recipients': { findRecipients, parseRecipientTag },
    '../components/RecipientSuggestions': { RecipientSuggestions: 'Suggestions' },
  }).ContactDialog;
  const render = () => h.render(() => component({ contact: null, onSaved() {}, onClose() {} }));
  const field = (label: string) => find(render(), (n) => n.props?.label === label)!.props;
  field('Name').onChange({ target: { value: 'exchange' } });
  const picker = find(
    render(),
    (n) => n.type === 'Suggestions' && n.props.suggestions.length > 0,
  )!.props;
  picker.onPick(picker.suggestions[0]);
  expect(field('Name').value).toBe(contact.label);
  expect(field('Address').value).toBe(address);
  expect(field('Destination tag (optional)').value).toBe('0');
  expect(field('Note (optional)').value).toBe(contact.note);
  find(render(), (n) => n.type === 'Button')!.props.onClick();
  await tick();
  expect(saveContact).toHaveBeenCalledWith(
    expect.objectContaining({ address, destinationTag: 0, note: contact.note }),
  );
  field('Address').onChange({ target: { value: 'not an XRP address' } });
  expect(find(render(), (n) => n.type === 'Button')!.props.disabled).toBe(true);
  expect(field('Destination tag (optional)').value).toBe('');
});

it('Send carries a selected contact tag into review without copying its note to a public memo', async () => {
  const h = hooks();
  const preparePayment = vi
    .fn<(input: unknown) => Promise<{ requestId: string }>>()
    .mockResolvedValue({ requestId: 'review' });
  const component = compile(
    resolve('src/ledgerly/ui/views/Send.tsx'),
    {
      react: h.react,
      'react/jsx-runtime': jsx,
      '@ledgerly/core/shared': shared,
      '../context': {
        useWallet: () => ({
          state: {
            accounts: [{ ...own, id: 'sender' }, own],
            activeAccountId: 'sender',
            network: { id: 'mainnet' },
          },
          wallet: { preparePayment },
        }),
      },
      '../store': {
        useAsyncData: () => ({ data: [contact] }),
        useAsyncAction: (fn: () => Promise<void>) => ({ run: fn, pending: false, error: null }),
      },
      '../components/primitives': Object.fromEntries(
        [
          'Button',
          'Callout',
          'DetailList',
          'Dialog',
          'DocLink',
          'Field',
          'RiskFindings',
          'SelectField',
          'TextField',
        ].map((x) => [x, x]),
      ),
      '../components/icons': {},
      '../format': { assetTicker: String },
      '../recipients': { findRecipients },
      '../components/RecipientSuggestions': { RecipientSuggestions: 'Suggestions' },
      '../session': {},
      '../metrics': {},
      '../components/QrScanner': {},
      '../external/joey': {},
      '../docs': { XRPL_DOCS: {} },
    },
    '\nexports.ComposeStage = ComposeStage;',
  ).ComposeStage;
  const render = () =>
    h.render(() =>
      component({
        initialAccountId: 'sender',
        initialPortfolio: { summary: { spendableDrops: '10000000' }, tokens: [] },
        onPrepared() {},
        onClose() {},
      }),
    );
  const field = (label: string) => find(render(), (n) => n.props?.label === label)!.props;
  const changeRecipient = (value: string) => {
    const input = find(field('Recipient').children('recipient'), (n) => n.type === 'input')!;
    input.props.onChange({ target: { value } });
  };
  changeRecipient('Exchange');
  field('Amount').onChange({ target: { value: '1' } });
  expect(
    find(render(), (n) => n.type === 'Button' && n.props.children === 'Review transaction')!.props
      .disabled,
  ).toBe(true);
  let picker = find(render(), (n) => n.type === 'Suggestions')!.props;
  picker.onPick(picker.suggestions[0]);
  expect(field('Destination tag (optional)').value).toBe('0');
  expect(field('Memo (optional)').value).toBe('');
  expect(preparePayment).not.toHaveBeenCalled();
  field('Amount').onChange({ target: { value: '1' } });
  find(
    render(),
    (n) => n.type === 'Button' && n.props.children === 'Review transaction',
  )!.props.onClick();
  await tick();
  expect(preparePayment).toHaveBeenCalledWith(
    expect.objectContaining({ destination: address, destinationTag: 0 }),
  );
  expect(preparePayment.mock.calls[0][0]).not.toHaveProperty('memo');
  changeRecipient('Savings');
  expect(field('Destination tag (optional)').value).toBe('');
  picker = find(render(), (n) => n.type === 'Suggestions')!.props;
  picker.onPick(picker.suggestions[0]);
  expect(field('Destination tag (optional)').value).toBe('');
  expect(preparePayment).toHaveBeenCalledTimes(1);
});
