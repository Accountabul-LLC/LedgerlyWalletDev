/**
 * Joey connect and sign-in invariants.
 *
 * An outside wallet can never be signed by the local keyring, a proof for
 * address A cannot authenticate address B, and a stale or foreign-domain
 * message is refused before a session is considered.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveAddress, deriveKeypair, generateSeed, sign, verify } from 'ripple-keypairs';
import { Keyring } from '@/ledgerly/core/keyring/keyring';
import { isValidAddress } from '@/ledgerly/core/xrpl/address';
import {
  assertJoeySignInMatchesSite,
  buildJoeySignInMessage,
  hashJoeyNonce,
  parseJoeySignInMessage,
} from '@/lib/joey-auth';
import { parseValidatedPayment } from '@/lib/ledger-payment';

const CLASSIC = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const HOST = 'ledgerlywallet.com';
const functions = readFileSync(resolve(process.cwd(), 'src/lib/joey-auth.functions.ts'), 'utf8');
const settings = readFileSync(resolve(process.cwd(), 'src/ledgerly/ui/views/Settings.tsx'), 'utf8');
const send = readFileSync(resolve(process.cwd(), 'src/ledgerly/ui/views/Send.tsx'), 'utf8');

function pair() {
  const { publicKey, privateKey } = deriveKeypair(generateSeed());
  return { publicKey, privateKey, address: deriveAddress(publicKey) };
}

describe('readiness: Joey external wallets', () => {
  it('T155 an external account can never be signed locally', async () => {
    expect(isValidAddress(CLASSIC)).toBe(true);
    const keyring = new Keyring();
    await keyring.add(
      {
        id: 'joey-1',
        label: 'Joey Wallet',
        address: CLASSIC,
        source: { kind: 'external', provider: 'joey', address: CLASSIC },
        createdAt: Date.now(),
      },
      null,
    );
    expect(keyring.isExternal('joey-1')).toBe(true);
    expect(() =>
      keyring.sign('joey-1', {
        TransactionType: 'Payment',
        Account: CLASSIC,
        Destination: CLASSIC,
        Amount: '1',
      }),
    ).toThrow(/another app/i);
  });

  it('T156 a signature for address A cannot authenticate address B', () => {
    const alice = pair();
    const bob = pair();
    const issuedAt = new Date().toISOString();
    const message = buildJoeySignInMessage({
      host: HOST,
      address: alice.address,
      nonce: 'nonce-one',
      issuedAt,
      uri: `https://${HOST}/auth`,
    });
    const messageHex = Buffer.from(message, 'utf8').toString('hex').toUpperCase();
    const signature = sign(messageHex, alice.privateKey);
    expect(verify(messageHex, signature, alice.publicKey)).toBe(true);
    expect(deriveAddress(alice.publicKey)).toBe(alice.address);
    expect(deriveAddress(alice.publicKey)).not.toBe(bob.address);
    expect(verify(messageHex, signature, bob.publicKey)).toBe(false);
  });

  it('T157 a wrong-domain or stale message is refused', () => {
    const now = Date.parse('2026-09-04T18:00:00.000Z');
    const fresh = buildJoeySignInMessage({
      host: HOST,
      address: CLASSIC,
      nonce: 'n1',
      issuedAt: new Date(now).toISOString(),
      uri: `https://${HOST}/auth`,
    });
    const parsed = parseJoeySignInMessage(fresh);
    expect(() => assertJoeySignInMatchesSite(parsed, HOST, now)).not.toThrow();
    expect(() => assertJoeySignInMatchesSite(parsed, 'evil.example', now)).toThrow(/another site/);

    const stale = buildJoeySignInMessage({
      host: HOST,
      address: CLASSIC,
      nonce: 'n2',
      issuedAt: new Date(now - 20 * 60 * 1000).toISOString(),
      uri: `https://${HOST}/auth`,
    });
    expect(() => assertJoeySignInMatchesSite(parseJoeySignInMessage(stale), HOST, now)).toThrow(
      /expired/,
    );
  });

  it('T158 a nonce is hashed the same way it is stored, and consume requires unused', () => {
    expect(hashJoeyNonce('abc')).toBe(hashJoeyNonce('abc'));
    expect(hashJoeyNonce('abc')).not.toBe(hashJoeyNonce('abcd'));
    expect(functions).toContain(".is('used_at', null)");
    expect(functions).toContain('hashJoeyNonce(parsed.nonce)');
    expect(functions).toContain('new URL(request.url).host');
    expect(functions).not.toContain("headers.get('origin')");
    expect(functions).toContain('JOEY_MAX_CHALLENGES_PER_WINDOW');
    expect(functions).toMatch(/\.delete\(\)\s*\.lt\('expires_at'/);
  });

  it('T159 Joey wallets do not offer a recovery-phrase reveal', () => {
    expect(settings).toMatch(/account\.external \? null/);
    expect(settings).toMatch(/activeIsExternal \? null/);
    expect(settings).toContain("title={isExternal ? 'Disconnect this wallet'");
  });

  it('T162 password reset uses the same strength rule as signup', () => {
    const reset = readFileSync(resolve(process.cwd(), 'src/routes/reset-password.tsx'), 'utf8');
    expect(reset).toContain('assessPassword');
    expect(reset).toContain('MIN_PASSWORD_LENGTH');
    expect(reset).not.toMatch(/password\.length\s*>=\s*8/);
  });

  it('T160 a failed Joey payment is not counted as value sent', () => {
    expect(send).toMatch(/if \(submission\.succeeded\)/);
    expect(send).toMatch(/recordSignedPayment\(state\.network\.id, submission\.hash\)/);
    expect(send).not.toMatch(/recordSignedPayment\([^)]*signed\.amount/);
  });
});

describe('readiness: ledger payment parse', () => {
  it('T161 only a validated Payment can be priced', () => {
    const hash = 'A'.repeat(64);
    expect(
      parseValidatedPayment({
        validated: true,
        TransactionType: 'Payment',
        hash,
        Amount: '1500000',
        meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1500000' },
      }),
    ).toEqual({ hash, amount: 1.5, currency: 'XRP' });
    expect(
      parseValidatedPayment({
        validated: false,
        TransactionType: 'Payment',
        hash,
        Amount: '1500000',
      }),
    ).toBeNull();
    expect(
      parseValidatedPayment({
        validated: true,
        TransactionType: 'OfferCreate',
        hash,
        Amount: '1500000',
      }),
    ).toBeNull();
    expect(
      parseValidatedPayment({
        validated: true,
        TransactionType: 'Payment',
        hash,
        Amount: { value: '10', currency: 'USD' },
        meta: {
          TransactionResult: 'tesSUCCESS',
          delivered_amount: { value: '9.5', currency: 'USD' },
        },
      }),
    ).toEqual({ hash, amount: 9.5, currency: 'USD' });
  });
});
