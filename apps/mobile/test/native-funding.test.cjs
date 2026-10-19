const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { compile } = require('./harness.cjs');
const { fundAndWait } = compile(path.resolve(__dirname, '../src/nativeFunding.ts'));
function fixture() {
  let funded = 0,
    read = 0,
    network = 'testnet',
    status = 'unlocked';
  const reads = [];
  const engine = {
    getState: async () => ({
      status,
      network: {
        id: network,
        isTest: network === 'testnet',
        faucet: network === 'testnet' ? 'test-only' : null,
      },
    }),
    getPortfolio: async (input) => {
      reads.push(input);
      return {
        summary: { exists: read++ > 1, balanceDrops: read > 2 ? '100000000' : '0' },
      };
    },
    fundTestAccount: async () => {
      funded++;
    },
  };
  return {
    engine,
    funded: () => funded,
    reads: () => reads,
    setNetwork: () => (network = 'mainnet'),
    lock: () => (status = 'locked'),
  };
}
test('faucet acceptance waits for a validated balance and never resubmits', async () => {
  const f = fixture();
  let waited = 0;
  await fundAndWait(f.engine, 'test-id', async () => {
    waited++;
  });
  assert.equal(f.funded(), 1);
  assert.equal(waited, 2);
  assert.equal(f.reads()[0].refresh, true);
  assert.ok(
    f
      .reads()
      .slice(1)
      .every((call) => call.refresh === true),
  );
});
test('funding is rejected on mainnet before any ledger read or faucet submission', async () => {
  const f = fixture();
  f.setNetwork();
  await assert.rejects(
    fundAndWait(f.engine, 'test-id', async () => {}),
    /test networks/,
  );
  assert.equal(f.funded(), 0);
});
test('network switch or background lock stops confirmation polling', async () => {
  for (const change of ['setNetwork', 'lock']) {
    const f = fixture();
    await assert.rejects(
      fundAndWait(f.engine, 'test-id', async () => f[change]()),
      /original network/,
    );
    assert.equal(f.funded(), 1);
  }
});
test('delayed validation reports pending and does not trigger another funding request', async () => {
  const f = fixture();
  f.engine.getPortfolio = async () => ({ summary: { exists: false, balanceDrops: '0' } });
  let waits = 0;
  await assert.rejects(
    fundAndWait(f.engine, 'test-id', async () => {
      waits++;
    }),
    /still pending/,
  );
  assert.equal(waits, 20);
  assert.equal(f.funded(), 1);
});
test('a network or lock change during the initial balance read prevents faucet submission', async () => {
  for (const change of ['setNetwork', 'lock']) {
    const f = fixture();
    const original = f.engine.getPortfolio;
    f.engine.getPortfolio = async () => {
      const result = await original();
      f[change]();
      return result;
    };
    await assert.rejects(
      fundAndWait(f.engine, 'test-id', async () => {}),
      /changed/,
    );
    assert.equal(f.funded(), 0);
  }
});
