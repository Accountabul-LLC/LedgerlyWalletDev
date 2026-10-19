import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { walletEventInput } from '@/lib/activity-input';
import {
  activityWritesAllowed,
  isProductionActivityNetwork,
  resolveActivityReportUrl,
  walletActivityBody,
  walletFingerprintMaterial,
} from '@/lib/activity-report';

const inserted: unknown[] = [];
const from = vi.fn(() => ({
  select: () => ({
    eq: () => ({
      eq: async () => ({ count: 0, error: null }),
    }),
  }),
  insert: async (row: unknown) => {
    inserted.push(row);
    return { error: null };
  },
}));

vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: { from },
}));
vi.mock('@/lib/activity-updates.server', () => ({
  notifyActivityUpdated: vi.fn(async () => undefined),
}));

import { ActivityReportError, recordPublicActivity } from '@/lib/activity-record.server';

const signerKey = '00000000-0000-4000-8000-000000000001';
const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

function fingerprint(kind: 'wallet_created' | 'wallet_activated'): string {
  return createHash('sha256')
    .update(walletFingerprintMaterial(kind, 'mainnet', address))
    .digest('hex');
}

afterEach(() => {
  inserted.length = 0;
  from.mockClear();
});

const LIVE_ACTIVITY_URL = 'https://ledgerlywallet.com/api/public/activity';
const LIVE_VERCEL_PROJECT_ID = 'prj_LIVE_PROJECT_ID_PLACEHOLDER';
const TEST_ACTIVITY_URL = 'https://ledgerly-test.vercel.app/api/public/activity';
const PRODUCTION_SUPABASE_URL = 'https://srvzinigfedppxwypmtt.supabase.co';
const TEST_SUPABASE_URL = 'https://hwvyrlrmdktgfbqdmufz.supabase.co';

describe('phone activity reports', () => {
  it('keeps the live counter only for the production website and production phone releases', () => {
    const report = readFileSync(resolve('src/lib/activity-report.ts'), 'utf8');
    const route = readFileSync(resolve('src/routes/api/public/activity.ts'), 'utf8');
    const serverFns = readFileSync(resolve('src/lib/metrics.functions.ts'), 'utf8');
    expect(report).not.toMatch(
      /export const PRODUCTION_ACTIVITY_URL\s*=\s*['"]https:\/\/ledgerlywallet\.com/,
    );
    expect(report).toContain('export const PRODUCTION_ACTIVITY_URL');
    expect(route).toContain('activityWritesAllowed');
    expect(serverFns).toContain('activityWritesAllowed');
    expect(isProductionActivityNetwork('mainnet')).toBe(true);
    expect(isProductionActivityNetwork('testnet')).toBe(false);
    const body = walletActivityBody({
      kind: 'wallet_created',
      signerKey,
      fingerprint: fingerprint('wallet_created'),
      address,
    });
    expect(body).not.toHaveProperty('address');
    expect(walletEventInput.safeParse(body).success).toBe(true);
    expect(walletEventInput.safeParse({ ...body, network: 'testnet' }).success).toBe(false);
  });

  it('records a phone wallet creation in platform_events', async () => {
    const body = walletActivityBody({
      kind: 'wallet_created',
      signerKey,
      fingerprint: fingerprint('wallet_created'),
    });
    await expect(recordPublicActivity(body)).resolves.toEqual({ ok: true });
    expect(inserted).toEqual([
      {
        kind: 'wallet_created',
        network: 'mainnet',
        signer_key: signerKey,
        usd_value: 0,
        dedupe_key: `wallet_created:mainnet:${fingerprint('wallet_created')}`,
      },
    ]);
  });

  it('rejects a practice network and an activation the ledger did not fund', async () => {
    await expect(
      recordPublicActivity({
        kind: 'wallet_created',
        network: 'testnet',
        signerKey,
        fingerprint: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ status: 400 });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ result: { error: 'actNotFound' } }), { status: 200 }),
      );
    await expect(
      recordPublicActivity(
        walletActivityBody({
          kind: 'wallet_activated',
          signerKey,
          fingerprint: fingerprint('wallet_activated'),
          address,
        }),
      ),
    ).rejects.toBeInstanceOf(ActivityReportError);
    expect(inserted).toEqual([]);
    fetchMock.mockRestore();
  });

  it('the phone app reports a new mainnet wallet, a funded wallet, and a signed payment', () => {
    const setup = readFileSync(resolve('mobile/src/app/setup.tsx'), 'utf8');
    const home = readFileSync(resolve('mobile/src/app/(tabs)/index.tsx'), 'utf8');
    const send = readFileSync(resolve('mobile/src/app/send.tsx'), 'utf8');
    const reporter = readFileSync(resolve('mobile/src/activity.ts'), 'utf8');
    expect(setup).toContain("useState('mainnet')");
    expect(setup).toContain("network.id === 'testnet'");
    expect(setup).toContain("network.id === 'devnet'");
    expect(setup).toContain('${network.label} (test)');
    expect(setup).toContain("if (address && networkId === 'mainnet')");
    expect(setup).toContain("recordPlatformEvent('wallet_created', networkId, address)");
    expect(setup).not.toContain('void state.network.id');
    expect(home).toContain('recordWalletActivated(state.network.id');
    expect(send).toContain('recordSignedPayment(state.network.id, result.hash)');
    expect(reporter).toContain('PRODUCTION_ACTIVITY_URL');
    expect(reporter).not.toMatch(/fetch\([^)]*\b(mnemonic|seed|privateKey)\b/i);
  });
});

describe('activity endpoint isolation', () => {
  const productionWeb = {
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_ID: LIVE_VERCEL_PROJECT_ID,
    SUPABASE_URL: PRODUCTION_SUPABASE_URL,
  };

  it('uses the live endpoint for the production website', () => {
    expect(resolveActivityReportUrl(productionWeb, { nativeRelease: false })).toBe(
      LIVE_ACTIVITY_URL,
    );
    expect(activityWritesAllowed(productionWeb)).toBe(true);
    expect(
      resolveActivityReportUrl(
        {
          VERCEL_ENV: 'production',
          VERCEL_PROJECT_PRODUCTION_URL: 'ledgerlywallet.com',
          SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        },
        { nativeRelease: false },
      ),
    ).toBe(LIVE_ACTIVITY_URL);
  });

  it('stays off for preview, development, local, and the test project', () => {
    expect(resolveActivityReportUrl({}, { nativeRelease: false })).toBe('');
    expect(activityWritesAllowed({})).toBe(false);
    expect(
      resolveActivityReportUrl(
        {
          VERCEL_ENV: 'preview',
          VERCEL_PROJECT_ID: LIVE_VERCEL_PROJECT_ID,
          SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        },
        { nativeRelease: false },
      ),
    ).toBe('');
    expect(
      activityWritesAllowed({
        VERCEL_ENV: 'preview',
        VERCEL_PROJECT_ID: LIVE_VERCEL_PROJECT_ID,
        SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        VITE_ACTIVITY_URL: TEST_ACTIVITY_URL,
      }),
    ).toBe(false);
    expect(
      resolveActivityReportUrl(
        { VERCEL_ENV: 'development', VERCEL_PROJECT_ID: LIVE_VERCEL_PROJECT_ID },
        { nativeRelease: false },
      ),
    ).toBe('');
    expect(
      resolveActivityReportUrl(
        {
          VERCEL_ENV: 'production',
          VERCEL_PROJECT_ID: 'prj_TEST_PROJECT_ID_PLACEHOLDER',
          VERCEL_PROJECT_PRODUCTION_URL: 'ledgerly-test.vercel.app',
          SUPABASE_URL: TEST_SUPABASE_URL,
        },
        { nativeRelease: false },
      ),
    ).toBe('');
    expect(
      resolveActivityReportUrl(
        { VITE_ACTIVITY_URL: LIVE_ACTIVITY_URL, SUPABASE_URL: TEST_SUPABASE_URL },
        { nativeRelease: false },
      ),
    ).toBe('');
    expect(
      activityWritesAllowed({
        SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        ACTIVITY_URL: TEST_ACTIVITY_URL,
      }),
    ).toBe(false);
  });

  it('records on the test site only when that site configures its own endpoint', () => {
    const testSite = {
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_ID: 'prj_TEST_PROJECT_ID_PLACEHOLDER',
      VERCEL_PROJECT_PRODUCTION_URL: 'ledgerly-test.vercel.app',
      SUPABASE_URL: TEST_SUPABASE_URL,
      VITE_ACTIVITY_URL: TEST_ACTIVITY_URL,
      ACTIVITY_URL: TEST_ACTIVITY_URL,
    };
    expect(resolveActivityReportUrl(testSite, { nativeRelease: false })).toBe(TEST_ACTIVITY_URL);
    expect(activityWritesAllowed(testSite)).toBe(true);
    expect(
      resolveActivityReportUrl(
        {
          ACTIVITY_URL: 'http://127.0.0.1:3000/api/public/activity',
          SUPABASE_URL: TEST_SUPABASE_URL,
        },
        { nativeRelease: false },
      ),
    ).toBe('http://127.0.0.1:3000/api/public/activity');
    expect(
      activityWritesAllowed({
        ACTIVITY_URL: 'http://127.0.0.1:3000/api/public/activity',
        SUPABASE_URL: TEST_SUPABASE_URL,
      }),
    ).toBe(true);
  });

  it('keeps the live endpoint for a production phone release and not for test or dev builds', () => {
    expect(resolveActivityReportUrl({}, { nativeRelease: true })).toBe(LIVE_ACTIVITY_URL);
    expect(resolveActivityReportUrl({}, { nativeRelease: false })).toBe('');
    expect(
      resolveActivityReportUrl({ EXPO_PUBLIC_LEDGERLY_BACKEND: 'test' }, { nativeRelease: true }),
    ).toBe('');
    expect(
      resolveActivityReportUrl(
        { EXPO_PUBLIC_ACTIVITY_URL: TEST_ACTIVITY_URL, EXPO_PUBLIC_LEDGERLY_BACKEND: 'test' },
        { nativeRelease: true },
      ),
    ).toBe(TEST_ACTIVITY_URL);
    expect(
      resolveActivityReportUrl(
        { EXPO_PUBLIC_ACTIVITY_URL: LIVE_ACTIVITY_URL },
        { nativeRelease: false },
      ),
    ).toBe('');
  });
});
