const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { compile } = require('./harness.cjs');

const appRequire = createRequire(path.resolve(__dirname, '../package.json'));
const issuer = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const hexCurrency = '524C555344000000000000000000000000000000';
const icon = 'https://s2.xrplmeta.org/icon/DD77BF0948.png';

function load(file, extra = {}) {
  const mocks = new Proxy(extra, {
    has(target, key) {
      return key in target || (typeof key === 'string' && !key.startsWith('.'));
    },
    get(target, key) {
      if (key in target) return target[key];
      return appRequire(key);
    },
  });
  return compile(file, mocks);
}

const marketData = load(path.resolve(__dirname, '../../../src/ledgerly/native/market-data.ts'));
const logos = load(path.resolve(__dirname, '../src/token-logo.ts'), {
  '../../../src/ledgerly/native/market-data': marketData,
});

function metadata(overrides = {}) {
  return {
    currency: hexCurrency,
    issuer,
    meta: { token: { icon } },
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('metadata URLs are built only for a checksum-valid currency and issuer', () => {
  assert.equal(
    logos.tokenLogoMetadataUrl(hexCurrency, issuer),
    `https://s1.xrplmeta.org/v2/token/${hexCurrency}:${issuer}`,
  );
  assert.equal(
    logos.tokenLogoMetadataUrl('USD', issuer),
    `https://s1.xrplmeta.org/v2/token/USD:${issuer}`,
  );
  assert.equal(logos.tokenLogoMetadataUrl('USD', 'not-an-issuer'), null);
  assert.equal(logos.tokenLogoMetadataUrl('XRP', null), null);
  assert.equal(logos.tokenLogoMetadataUrl('XRP', issuer), null);
  assert.equal(marketData.marketIdentity(hexCurrency, issuer), '0dd550278b74cb6690fdae351e8e0df3');
});

test('only matching raster icons on the public XRPL Meta hosts are accepted', () => {
  assert.equal(logos.tokenLogoFromMetadata(metadata(), hexCurrency, issuer), icon);
  assert.equal(
    logos.tokenLogoFromMetadata(
      metadata({ issuer: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' }),
      hexCurrency,
      issuer,
    ),
    null,
  );
  assert.equal(
    logos.tokenLogoFromMetadata(metadata({ currency: 'USD' }), hexCurrency, issuer),
    null,
  );
  for (const bad of [
    'javascript:alert(1)',
    'https://attacker.test/icon/a.png',
    'https://s2.xrplmeta.org.attacker.test/icon/a.png',
    'https://s2.xrplmeta.org/icon/a.svg',
    'https://s2.xrplmeta.org/icon/a.png?key=secret',
    'https://api.xrpl.to/v1/thumb/0dd550278b74cb6690fdae351e8e0df3',
    null,
  ]) {
    assert.equal(logos.isPublicTokenIcon(bad), false);
    assert.equal(
      logos.tokenLogoFromMetadata(
        metadata({ meta: { token: { icon: bad } } }),
        hexCurrency,
        issuer,
      ),
      null,
    );
  }
  assert.equal(
    logos.isFirstPartyMarketLogo(
      'https://market.example/api/public/market/logo/0dd550278b74cb6690fdae351e8e0df3',
    ),
    true,
  );
  assert.equal(logos.isFirstPartyMarketLogo('https://evil.example/logo.png'), false);
  assert.equal(logos.isFirstPartyMarketLogo(`${icon}?token=secret`), false);
});

test('logo reads stay anonymous, bounded, and off the keyed thumbnail API', async () => {
  const calls = [];
  const load = logos.createTokenLogoLoader(async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.headers.Accept, 'application/json');
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.redirect, 'error');
    assert.equal(JSON.stringify(init.headers).includes('apiKey'), false);
    return jsonResponse(metadata());
  });
  const signal = new AbortController().signal;
  assert.equal(await load(hexCurrency, issuer, signal), icon);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, logos.tokenLogoMetadataUrl(hexCurrency, issuer));
  assert.equal(calls[0].url.includes('thumb'), false);
  assert.equal(calls[0].url.includes('api.xrpl.to'), false);
  assert.equal(await load(hexCurrency, issuer, signal), icon);
  assert.equal(calls.length, 1);
  assert.equal(await load('USD', 'not-an-issuer', signal), null);
  assert.equal(await load('XRP', null, signal), null);
  assert.equal(calls.length, 1);
});

test('a missing or rejected logo caches a short miss and still returns null', async () => {
  let reads = 0;
  const load = logos.createTokenLogoLoader(async () => {
    reads += 1;
    return jsonResponse(metadata({ meta: { token: { icon: null } } }));
  });
  const signal = new AbortController().signal;
  assert.equal(await load('USD', issuer, signal), null);
  assert.equal(await load('USD', issuer, signal), null);
  assert.equal(reads, 1);
});

test('at most three metadata reads run at once', async () => {
  let active = 0;
  let peak = 0;
  const release = [];
  const load = logos.createTokenLogoLoader(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => release.push(resolve));
    active -= 1;
    return jsonResponse(metadata());
  });
  const pending = Promise.all(
    Array.from({ length: 8 }, () => load(hexCurrency, issuer, new AbortController().signal)),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(release.length, 3);
  assert.equal(peak, 3);
  while (release.length) {
    release.shift()();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const results = await pending;
  assert.equal(
    results.every((url) => url === icon),
    true,
  );
});

test('initials use the ticker and stay short when a token has no name', () => {
  assert.equal(logos.tokenInitials('RLUSD'), 'RL');
  assert.equal(logos.tokenInitials('usd'), 'US');
  assert.equal(logos.tokenInitials('  '), '•');
  assert.equal(logos.tokenInitials(''), '•');
});
