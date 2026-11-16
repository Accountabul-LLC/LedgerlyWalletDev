import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hexToBytes, utf8ToBytes } from '@/ledgerly/core/crypto/bytes';
import { WalletEngine } from '@/ledgerly/core/engine/engine';
import { ProviderError } from '@/ledgerly/core/engine/provider-errors';
import type { ApprovalRequest } from '@/ledgerly/core/rpc/protocol';
import { MemoryStore } from '@/ledgerly/core/storage/ports';
import { MemorySessionStore } from '@/ledgerly/core/storage/session';
import { deriveAddress } from 'ripple-keypairs';

const PASSWORD = 'correct-horse-battery-staple-99';
const SITE = 'https://app.accountabul.test/dashboard';
const OTHER = 'https://evil.example/phish';

async function unlockedEngine(options?: {
  onApprovalRequested?: () => void;
  onProviderEvent?: (event: unknown) => void;
}) {
  const engine = new WalletEngine({
    store: new MemoryStore(),
    session: new MemorySessionStore(),
    version: 'test',
    defaultNetworkId: 'testnet',
    onApprovalRequested: options?.onApprovalRequested,
    onProviderEvent: options?.onProviderEvent as never,
  });
  await engine.start();
  await engine.createWallet({ password: PASSWORD });
  await engine.confirmBackup();
  return { engine };
}

async function waitForApproval(
  engine: WalletEngine,
  kind?: ApprovalRequest['kind'],
): Promise<ApprovalRequest> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const list = await engine.listApprovals();
    const match = kind ? list.find((entry) => entry.kind === kind) : list[0];
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for${kind ? ` ${kind}` : ''} approval.`);
}

async function waitUntil(
  predicate: () => Promise<boolean> | boolean,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function connectSite(engine: WalletEngine, url = SITE): Promise<readonly string[]> {
  const provider = engine.provider(url);
  const connectPromise = provider.requestAccounts({ network: 'xrpl:testnet' });
  const request = await waitForApproval(engine, 'connect');
  const accountId = (await engine.getState()).activeAccountId!;
  await engine.resolveApproval({ id: request.id, approved: true, accountIds: [accountId] });
  return connectPromise;
}

/** Mirrors Accountabul verify-signature.server.ts for secp256k1 proofs. */
function verifyAccountabulSecp256k1(proof: {
  address: string;
  message: string;
  signature: string;
  publicKey: string;
  algorithm: string;
}): boolean {
  expect(proof.algorithm).toBe('secp256k1');
  const publicKeyHex = proof.publicKey.toLowerCase();
  expect(deriveAddress(publicKeyHex)).toBe(proof.address);
  const compressed = Buffer.from(publicKeyHex, 'hex');
  const uncompressed = Buffer.from(secp256k1.Point.fromBytes(compressed).toBytes(false));
  const keyObject = createPublicKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'secp256k1',
      x: uncompressed.subarray(1, 33).toString('base64url'),
      y: uncompressed.subarray(33, 65).toString('base64url'),
    },
  });
  return cryptoVerify(
    'SHA256',
    Buffer.from(proof.message, 'utf8'),
    { key: keyObject, dsaEncoding: 'ieee-p1363' },
    Buffer.from(proof.signature, 'hex'),
  );
}

describe('Ledgerly Connect provider', () => {
  it('keeps origin grants after lock without exposing accounts while locked', async () => {
    const { engine } = await unlockedEngine();
    const provider = engine.provider(SITE);
    const accounts = await connectSite(engine);
    expect(Array.isArray(accounts)).toBe(true);

    await engine.lock();
    expect(await provider.isUnlocked()).toBe(false);
    const lockedStatus = await provider.getStatus();
    expect(lockedStatus).toMatchObject({
      setup: true,
      unlocked: false,
      authorized: true,
    });
    expect(await provider.getAccounts()).toEqual([]);

    await engine.unlock({ password: PASSWORD });
    expect(await provider.isUnlocked()).toBe(true);
    expect(await provider.getAccounts()).toEqual(accounts);
    expect(await engine.listApprovals()).toHaveLength(0);
    expect(await provider.requestAccounts({ network: 'xrpl:testnet' })).toEqual(accounts);
  });

  it('defers connect while locked and resumes after unlock', async () => {
    const opened = vi.fn();
    const { engine } = await unlockedEngine({ onApprovalRequested: opened });
    const accountId = (await engine.getState()).activeAccountId!;
    const accountsBefore = (await engine.getState()).accounts;

    await engine.lock();
    opened.mockClear();
    const provider = engine.provider(SITE);
    const pending = provider.requestAccounts({ network: 'xrpl:testnet' });
    await waitUntil(() => opened.mock.calls.length > 0, 'approval window open');
    await waitUntil(
      async () => (await engine.getState()).pendingSiteConnect?.hostname === 'app.accountabul.test',
      'pending site connect',
    );

    await engine.unlock({ password: PASSWORD });
    const request = await waitForApproval(engine, 'connect');
    await engine.resolveApproval({
      id: request.id,
      approved: true,
      accountIds: [accountId],
    });
    const result = await pending;
    expect(result).toEqual([accountsBefore[0]!.address]);
    expect((await engine.getState()).pendingSiteConnect).toBeNull();
  });

  it('defers first-run setup and resumes after create + backup', async () => {
    const opened = vi.fn();
    const engine = new WalletEngine({
      store: new MemoryStore(),
      session: new MemorySessionStore(),
      version: 'test',
      defaultNetworkId: 'testnet',
      onApprovalRequested: opened,
    });
    await engine.start();
    const provider = engine.provider(SITE);
    const pending = provider.requestAccounts({ network: 'xrpl:testnet' });
    await waitUntil(() => opened.mock.calls.length > 0, 'approval window open');
    expect((await engine.getState()).status).toBe('uninitialized');

    await engine.createWallet({ password: PASSWORD });
    expect(await engine.listApprovals()).toHaveLength(0);
    await engine.confirmBackup();

    const request = await waitForApproval(engine, 'connect');
    const accountId = (await engine.getState()).activeAccountId!;
    await engine.resolveApproval({ id: request.id, approved: true, accountIds: [accountId] });
    const result = await pending;
    expect(result).toHaveLength(1);
  });

  it('signs ownership messages verifiable by Accountabul secp256k1 rules', async () => {
    const { engine } = await unlockedEngine();
    const provider = engine.provider(SITE);
    const accounts = await connectSite(engine);
    const address = accounts[0]!;

    const message = [
      'Accountabul Wallet Control Verification',
      'version:1',
      'audience:https://www.accountabul.com',
      'origin:https://app.accountabul.test',
      'network:xrpl:testnet',
      `address:${address}`,
      'user:00000000-0000-4000-8000-000000000001',
      'nonce:test-nonce-abc',
      `issued:${new Date().toISOString()}`,
      `expires:${new Date(Date.now() + 300_000).toISOString()}`,
      'purpose:connect',
    ].join('\n');

    const signPromise = provider.signMessage({
      address,
      message,
      network: 'xrpl:testnet',
    });
    const signRequest = await waitForApproval(engine, 'signMessage');
    if (signRequest.kind === 'signMessage') {
      expect(signRequest.message).toBe(message);
    }
    await engine.resolveApproval({ id: signRequest.id, approved: true });
    const proof = await signPromise;

    expect(proof.address).toBe(address);
    expect(proof.algorithm).toBe('secp256k1');
    expect(hexToBytes(proof.signature)).toHaveLength(64);
    expect(verifyAccountabulSecp256k1(proof)).toBe(true);
    // Message bytes themselves are what Accountabul hashes — not hex-encoded UTF-8.
    expect(utf8ToBytes(proof.message)).toEqual(utf8ToBytes(message));
  });

  it('rejects foreign origins, unauthorized signing, and concurrent deferred connects', async () => {
    const { engine } = await unlockedEngine();
    const good = engine.provider(SITE);
    const accounts = await connectSite(engine);

    const evil = engine.provider(OTHER);
    await expect(
      evil.signMessage({ address: accounts[0]!, message: 'steal', network: 'xrpl:testnet' }),
    ).rejects.toMatchObject({ code: 'unauthorized' } satisfies Partial<ProviderError>);

    await engine.lock();
    const first = good.requestAccounts({ network: 'xrpl:testnet' });
    await waitUntil(
      async () => (await engine.getState()).pendingSiteConnect !== null,
      'deferred connect',
    );
    await expect(good.requestAccounts({ network: 'xrpl:testnet' })).rejects.toMatchObject({
      code: 'pending_request',
    });
    await good.disconnect();
    await expect(first).rejects.toMatchObject({ code: 'user_rejected' });
  });

  it('emits accountsChanged on grant and disconnect', async () => {
    const events: Array<{ event: string; payload: unknown; origin?: string }> = [];
    const { engine } = await unlockedEngine({
      onProviderEvent: (event) => events.push(event as never),
    });
    const provider = engine.provider(SITE);
    const accounts = await connectSite(engine);

    expect(events.some((entry) => entry.event === 'accountsChanged')).toBe(true);
    await provider.disconnect();
    expect(events.some((entry) => entry.event === 'disconnect')).toBe(true);
    expect(
      events.filter((entry) => entry.event === 'accountsChanged').at(-1)?.payload,
    ).toEqual([]);
    expect((await provider.getStatus()).authorized).toBe(false);
    expect(accounts).toHaveLength(1);
  });

  it('does not treat a transaction signature path as message signing', async () => {
    const { engine } = await unlockedEngine();
    const provider = engine.provider(SITE);
    expect(typeof provider.signMessage).toBe('function');
    expect(typeof provider.signTransaction).toBe('function');
    expect(provider.signMessage).not.toBe(provider.signTransaction);
  });
});
