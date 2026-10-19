const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { compile, hooks, jsx, tick } = require('./harness.cjs');

const opened = [];

function panel() {
  opened.length = 0;
  const snapshot = {
    fetchedAt: Date.now(),
    assets: Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      ticker: 'SYN',
      currency: 'SYN',
      issuer: 'synthetic-issuer',
      priceUsd: '1.25',
      change24h: 2,
    })),
  };
  return compile(path.resolve(__dirname, '../src/MarketPanel.tsx'), {
    'react/jsx-runtime': jsx,
    'react-native': {
      FlatList: 'FlatList',
      Pressable: 'Pressable',
      Text: 'Text',
      View: 'View',
      StyleSheet: { create: (v) => v },
      Linking: {
        openURL: async (url) => {
          opened.push(url);
        },
      },
    },
    '../../../src/ledgerly/native/market-data': {
      MARKET_ATTRIBUTION: 'Data by xrpl.to',
      MARKET_PROVIDER_URL: 'https://xrpl.to',
    },
    './brand': { BRAND: {} },
    './icons': {},
    './TokenAvatar': { TokenAvatar: function TokenAvatar() {} },
    './market-format': { marketPrice: (value) => value },
    './market': {
      useMarket: () => ({
        snapshot,
        saved: true,
        loading: false,
        error: null,
        refresh: async () => {},
      }),
    },
  });
}

test('Home market preview mounts five rows while expanded quotes use a virtualized list', () => {
  const { MarketPanel } = panel();
  const preview = MarketPanel({});
  assert.equal(preview.props.children[1].length, 5);
  const row = preview.props.children[1][0].type(preview.props.children[1][0].props);
  const avatar = row.props.children[0];
  assert.equal(avatar.type.name, 'TokenAvatar');
  assert.equal(avatar.props.symbol, 'SYN');
  assert.equal(avatar.props.currency, 'SYN');
  const expanded = MarketPanel({ expanded: true });
  assert.equal(expanded.type, 'FlatList');
  assert.equal(expanded.props.data.length, 20);
  assert.equal(expanded.props.initialNumToRender, 8);
});

function attributionLink(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.accessibilityRole === 'link') return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = attributionLink(child);
    if (found) return found;
  }
  return null;
}

test('quotes label Mainnet/USD separately from wallet balances and show saved timestamp', async () => {
  const { MarketPanel } = panel();
  const header = MarketPanel({ expanded: true }).props.ListHeaderComponent;
  const labels = JSON.stringify(header);
  assert.match(labels, /Mainnet prices · USD/);
  assert.match(labels, /Saved prices/);
  assert.match(labels, /Data by xrpl\.to/);
  assert.doesNotMatch(labels, /XRPL Meta/);
  assert.doesNotMatch(labels, /↗/);
  const status = header.props.children[1];
  assert.equal(status.type, 'Text');
  const link = attributionLink(status);
  assert.equal(link.type, 'Text');
  assert.equal(link.props.children, 'Data by xrpl.to');
  assert.equal(link.props.accessibilityLabel, 'Data by xrpl.to');
  assert.equal(link.props.style, status.props.style);
  link.props.onPress();
  assert.deepEqual(opened, ['https://xrpl.to']);

  opened.length = 0;
  const preview = MarketPanel({});
  const previewLabels = JSON.stringify(preview);
  assert.match(previewLabels, /Saved prices/);
  assert.match(previewLabels, /Data by xrpl\.to/);
  assert.doesNotMatch(previewLabels, /XRPL Meta/);
  const previewLink = attributionLink(preview);
  assert.equal(previewLink.props.children, 'Data by xrpl.to');
  previewLink.props.onPress();
  assert.deepEqual(opened, ['https://xrpl.to']);
});

const icon = 'https://s2.xrplmeta.org/icon/DD77BF0948.png';

function avatarModule(react, market, tokenLogo) {
  return compile(path.resolve(__dirname, '../src/TokenAvatar.tsx'), {
    react,
    'react/jsx-runtime': jsx,
    'react-native': { View: 'View', Text: 'Text' },
    'expo-image': { Image: 'Image' },
    'expo/fetch': {
      fetch: async () => {
        throw new Error('unexpected image metadata fetch');
      },
    },
    '../../../src/ledgerly/native/market-data': { marketIdentity: () => null },
    './icons': { XrpSymbol: 'XrpSymbol' },
    './brand': {
      BRAND: { cream: '#F5F5EF', ink: '#171A18', line: '#DADDD7', lineStrong: '#AEB4AE' },
    },
    './market': market,
    './token-logo': tokenLogo,
  });
}

test('native token avatar keeps a fixed initials fallback and the local XRP symbol', () => {
  const { TokenAvatar } = avatarModule(
    { useState: () => [null, () => {}], useEffect: () => {} },
    { tokenLogoUrl: () => 'https://evil.example/logo.png' },
    {
      createTokenLogoLoader: () => async () => 'https://evil.example/logo.png',
      isFirstPartyMarketLogo: () => false,
      isPublicTokenIcon: (url) => url === icon,
      tokenInitials: (label) => label.slice(0, 2).toUpperCase(),
    },
  );
  const token = TokenAvatar({ currency: 'USD', issuer: 'not-an-issuer', symbol: 'usd' });
  const disk = token.props.children[0];
  const label = token.props.children[1];
  assert.equal(token.props.collapsable, false);
  assert.equal(token.props.style.width, 44);
  assert.equal(token.props.style.height, 44);
  assert.equal(disk.props.style.width, 44);
  assert.equal(disk.props.style.height, 44);
  assert.equal(disk.props.style.borderRadius, 22);
  assert.equal(disk.props.style.backgroundColor, '#DADDD7');
  assert.notEqual(disk.props.style.backgroundColor, '#F5F5EF');
  assert.equal(disk.props.style.borderColor, '#AEB4AE');
  assert.equal(label.type, 'Text');
  assert.equal(label.props.children, 'US');
  assert.equal(label.props.style.textAlign, 'center');
  assert.equal(label.props.style.includeFontPadding, false);
  assert.equal(token.props.children[2], null);
  assert.equal(TokenAvatar({ currency: 'XRP', issuer: null }).type, 'XrpSymbol');
});

test('a public icon renders, and an image error returns to the initials', async () => {
  const h = hooks();
  let resolveLogo;
  const { TokenAvatar } = avatarModule(
    h.react,
    { tokenLogoUrl: () => null },
    {
      createTokenLogoLoader: () => () =>
        new Promise((resolve) => {
          resolveLogo = resolve;
        }),
      isFirstPartyMarketLogo: () => false,
      isPublicTokenIcon: (url) => url === icon,
      tokenInitials: () => 'RL',
    },
  );
  const render = () =>
    h.render(() => TokenAvatar({ currency: 'USD', issuer: 'rIssuer', symbol: 'RLUSD' }));
  render();
  h.effects();
  resolveLogo(icon);
  await tick();
  const loaded = render();
  const image = loaded.props.children[2];
  assert.equal(image.type, 'Image');
  assert.equal(image.props.source.uri, icon);
  assert.equal(image.props.style.width, 44);
  assert.equal(image.props.style.borderRadius, 22);
  image.props.onError();
  const failed = render();
  assert.equal(failed.props.children[2], null);
  assert.equal(failed.props.children[0].props.style.backgroundColor, '#DADDD7');
  assert.equal(failed.props.children[1].props.children, 'RL');
});
