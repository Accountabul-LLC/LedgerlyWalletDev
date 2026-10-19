/**
 * The wallet holds keys in the page, so the document's own protections are
 * part of the security model. These checks pin the response headers and the
 * bounds on the one write endpoint that takes no session, so neither can be
 * loosened without a test failing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../../src/lib/security-headers';
import { signedPaymentInput, walletEventInput } from '../../src/lib/activity-input';

const server = readFileSync(resolve(process.cwd(), 'src/server.ts'), 'utf8');
const headers = readFileSync(resolve(process.cwd(), 'src/lib/security-headers.ts'), 'utf8');
const metrics = readFileSync(resolve(process.cwd(), 'src/lib/activity-record.server.ts'), 'utf8');

describe('readiness: browser hardening', () => {
  it('T120 every HTML document carries a content security policy', () => {
    expect(server).toContain('securityHeaders');
    expect(headers).toContain("default-src 'self'");
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("base-uri 'self'");
    expect(headers).toContain("form-action 'self'");
  });

  it('T121 the live wallet origin does not load editor scripts or foreign frames', () => {
    const production = contentSecurityPolicy('ledgerlywallet.com');
    expect(production).toContain("frame-ancestors 'self'");
    expect(production).not.toContain('*.lovable.app');
    expect(production).not.toContain('*.lovableproject.com');
    expect(production).not.toContain('cdn.gpteng.co');
    expect(production).not.toContain('lovable.dev');
    expect(production).not.toContain("'unsafe-eval'");
    expect(headers).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy('preview.vercel.app')).toBe(production);
  });

  it('T122 sniffing, referrers, and transport are locked down', () => {
    expect(headers).toContain("'x-content-type-options': 'nosniff'");
    expect(headers).toContain("'referrer-policy': 'no-referrer'");
    expect(headers).toContain('strict-transport-security');
    expect(headers).toContain('includeSubDomains');
    expect(server).not.toContain('if (!headers.has(name))');
  });

  it('T123 only the camera is granted, for the QR scanner', () => {
    const line = headers.split('\n').find((row) => row.includes('permissions-policy'));
    expect(line).toContain('camera=(self)');
    expect(line).toContain('microphone=()');
    expect(line).toContain('geolocation=()');
  });

  it('T124 the priced metrics write only counts a validated ledger payment', () => {
    expect(metrics).toContain('txHash');
    expect(metrics).toContain('parseValidatedPayment');
    expect(metrics).toContain("xrp_value: payment.currency === 'XRP' ? payment.amount : 0");
    expect(metrics).not.toContain('usdValueOf');
    expect(metrics).not.toMatch(/amount:\s*data\.amount/);
  });

  it('T126 public activity writes only accept production metadata', () => {
    const common = {
      network: 'mainnet',
      signerKey: '00000000-0000-4000-8000-000000000001',
    } as const;
    expect(signedPaymentInput.safeParse({ ...common, txHash: 'A'.repeat(64) }).success).toBe(true);
    expect(
      walletEventInput.safeParse({
        ...common,
        kind: 'wallet_created',
        fingerprint: 'a'.repeat(64),
      }).success,
    ).toBe(true);

    for (const network of ['testnet', 'devnet']) {
      expect(
        signedPaymentInput.safeParse({ ...common, network, txHash: 'A'.repeat(64) }).success,
      ).toBe(false);
      expect(
        walletEventInput.safeParse({
          ...common,
          network,
          kind: 'wallet_created',
          fingerprint: 'a'.repeat(64),
        }).success,
      ).toBe(false);
    }

    expect(
      walletEventInput.safeParse({
        ...common,
        kind: 'wallet_created',
        fingerprint: 'a'.repeat(64),
        recoveryPhrase: 'must never be accepted',
      }).success,
    ).toBe(false);
  });
});
