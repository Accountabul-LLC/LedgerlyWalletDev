import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Wallet } from 'xrpl';
import { WalletEngine } from '../src/ledgerly/core/engine/engine';
import { MemorySessionStore } from '../src/ledgerly/core/storage/session';
import type { KeyValueStore } from '../src/ledgerly/core/storage/ports';
import { createMnemonic } from '../src/ledgerly/core/keyring/mnemonic';
import type { SubmissionResult } from '../src/ledgerly/core/xrpl/submit';

type BenchmarkWallet = {
  label: string;
  address: string;
  balanceDrops?: string;
};

type BenchmarkReport = {
  runtime: string;
  startedAt: string;
  metrics: Record<string, number>;
  checks: Record<string, boolean>;
  wallets: BenchmarkWallet[];
  aggregateBalanceDrops?: string;
  transaction?: SubmissionResult;
  postPayment?: {
    balancesDrops: string[];
    aggregateBalanceDrops: string;
    feeDrops: string;
  };
  completedAt?: string;
  failure?: string;
};

function faucetDestination(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('account' in value)) return undefined;
  const account = value.account;
  if (!account || typeof account !== 'object' || !('address' in account)) return undefined;
  return account.address;
}

// This runs the actual engine in Node, separately from Android UI measurements.
// The cloud build adapter adds the session HTTPS proxy to xrpl's Client only.
const privateRoot = process.env.LEDGERLY_TEST_PRIVATE_DIR;
const reportPath = process.env.LEDGERLY_TEST_REPORT;
assert(privateRoot && reportPath, 'Set private data and public report paths explicitly.');
await mkdir(privateRoot, { recursive: true, mode: 0o700 });
const vaultPath = `${privateRoot}/engine-test-vault.json`;
class FileStore implements KeyValueStore {
  async data(): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await readFile(vaultPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }
  async get<T>(key: string): Promise<T | undefined> {
    return (await this.data())[key] as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    const data = await this.data();
    data[key] = value;
    await writeFile(vaultPath, JSON.stringify(data), { mode: 0o600 });
  }
  async remove(key: string): Promise<void> {
    const data = await this.data();
    delete data[key];
    await writeFile(vaultPath, JSON.stringify(data), { mode: 0o600 });
  }
  async clear(): Promise<void> {
    await rm(vaultPath, { force: true });
  }
}
const store = new FileStore();
const report: BenchmarkReport = {
  runtime: 'Node.js engine integration; not Android UI',
  startedAt: new Date().toISOString(),
  metrics: {},
  checks: {},
  wallets: [],
};
async function measure<T>(name: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await run();
  report.metrics[name] = Math.round((performance.now() - started) * 100) / 100;
  console.log(name, report.metrics[name], 'ms');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return result;
}
const makeEngine = () =>
  new WalletEngine({ store, session: new MemorySessionStore(), version: 'cloud-integration-test' });
let engine = makeEngine();
const password = 'Ledgerly-Test-' + randomBytes(24).toString('base64url');
try {
  await measure('engineStartMs', () => engine.start());
  await measure('createWalletMs', () => engine.createWallet({ password }));
  await engine.confirmBackup();
  const first = (await engine.getState()).accounts[0]!;
  await engine.renameAccount({ accountId: first.id, label: 'Wallet 1' });
  for (let index = 2; index <= 4; index++) {
    await measure(`createWallet${index}Ms`, () =>
      engine.addAccountWithOwnPhrase({ mnemonic: createMnemonic(), label: `Wallet ${index}` }),
    );
  }
  const imported = Wallet.generate();
  assert(imported.seed);
  await measure('importWallet5Ms', () =>
    engine.importAccount({
      seed: imported.seed!,
      label: 'Wallet 5',
      expectedAddress: imported.classicAddress,
    }),
  );
  const accounts = (await engine.getState()).accounts;
  assert.equal(accounts.length, 5);
  assert.equal(new Set(accounts.map((a) => a.address)).size, 5);
  report.wallets = accounts.map(({ label, address }) => ({ label, address }));
  report.checks.fiveDistinctWallets = true;
  const disk = await readFile(vaultPath, 'utf8');
  assert(!disk.includes(password) && !disk.includes(imported.seed));
  report.checks.importedSeedAndPasswordAbsentFromDurablePlaintext = true;
  await engine.lock();
  engine = makeEngine();
  await engine.start();
  assert.equal((await engine.getState()).status, 'locked');
  await measure('restartUnlockMs', () => engine.unlock({ password }));
  assert.deepEqual(
    (await engine.getState()).accounts.map((a) => a.address),
    accounts.map((a) => a.address),
  );
  report.checks.newEngineRestoresFiveAddresses = true;
  await engine.setNetwork({ networkId: 'testnet' });
  for (const account of accounts) {
    await measure(`fund${account.label.replace(' ', '')}Ms`, async () => {
      const response = await fetch('https://faucet.altnet.rippletest.net/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: account.address }),
      });
      assert(response.ok, `Faucet returned HTTP ${response.status}`);
      const body: unknown = await response.json();
      assert.equal(faucetDestination(body), account.address);
    });
  }
  let portfolios = await measure('fiveBalancesColdMs', () =>
    Promise.all(accounts.map((a) => engine.getPortfolio({ accountId: a.id, refresh: true }))),
  );
  // Faucet acceptance precedes ledger validation. Wait for the ledger rather
  // than treating its initial zero balances as a persistence or funding bug.
  for (
    let attempt = 0;
    attempt < 15 && portfolios.some((p) => BigInt(p.summary.balanceDrops) === 0n);
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    portfolios = await Promise.all(
      accounts.map((a) => engine.getPortfolio({ accountId: a.id, refresh: true })),
    );
  }
  const balances = portfolios.map((p) => BigInt(p.summary.balanceDrops));
  assert(balances.every((b) => b > 0n));
  report.aggregateBalanceDrops = balances.reduce((sum, b) => sum + b, 0n).toString();
  report.wallets.forEach((wallet, index) => {
    wallet.balanceDrops = balances[index]!.toString();
  });
  await measure('fiveBalancesCachedMs', () =>
    Promise.all(accounts.map((a) => engine.getPortfolio({ accountId: a.id }))),
  );
  await measure('fiveHistoryLoadsMs', () =>
    Promise.all(accounts.map((a) => engine.getHistory({ accountId: a.id }))),
  );
  await measure('rapidSwitch20Ms', async () => {
    for (let i = 0; i < 20; i++) {
      const account = accounts[i % 5]!;
      await engine.selectAccount({ accountId: account.id });
      assert.equal((await engine.getState()).activeAccountId, account.id);
    }
  });
  const payment = await measure('preparePaymentMs', () =>
    engine.preparePayment({
      accountId: accounts[0]!.id,
      destination: accounts[1]!.address,
      amount: { kind: 'xrp', value: '1' },
    }),
  );
  const submitted = await measure('submitAndValidatePaymentMs', () =>
    engine.confirmPrepared({ requestId: payment.requestId }),
  );
  report.transaction = submitted;
  const after = await Promise.all(
    accounts.map((a) => engine.getPortfolio({ accountId: a.id, refresh: true })),
  );
  assert(BigInt(after[0]!.summary.balanceDrops) < balances[0]! - 1_000_000n);
  assert.equal(BigInt(after[1]!.summary.balanceDrops), balances[1]! + 1_000_000n);
  const afterBalances = after.map((p) => BigInt(p.summary.balanceDrops));
  const afterTotal = afterBalances.reduce((sum, balance) => sum + balance, 0n);
  const fee = BigInt(payment.transaction.Fee!);
  assert.equal(BigInt(report.aggregateBalanceDrops) - afterTotal, fee);
  assert.deepEqual(afterBalances.slice(2), balances.slice(2));
  report.postPayment = {
    balancesDrops: afterBalances.map(String),
    aggregateBalanceDrops: afterTotal.toString(),
    feeDrops: fee.toString(),
  };
  report.checks.aggregateDropsOnlyByPaymentFee = true;
  report.checks.testnetPaymentDebitsSourceCreditsDestination = true;
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.failure = error instanceof Error ? error.message : 'Integration failed';
  process.exitCode = 1;
} finally {
  await engine.lock();
  await store.clear();
  report.checks.disposableEngineVaultRemoved = true;
  await writeFile(reportPath!, JSON.stringify(report, null, 2));
  console.log('Public integration report saved.');
}
