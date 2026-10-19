const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('publishable API keys remain in apikey while real session bearer tokens are preserved', async () => {
  let options;
  const requests = [];
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, '../src/auth.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    Headers,
    Request,
    process: {
      env: {
        EXPO_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
      },
    },
    fetch: async (_url, init) => {
      requests.push(init);
      return {};
    },
    require(id) {
      if (id === 'react-native-url-polyfill/auto' || id === 'expo-secure-store') return {};
      if (id === '@supabase/supabase-js')
        return {
          createClient: (_url, _key, config) => {
            options = config;
            return {};
          },
        };
      if (id.endsWith('/public-config')) return { isPublicSupabaseKey: () => true };
      throw new Error('Unexpected synthetic dependency');
    },
  });
  exports.getSupabaseClient();
  assert.equal(options.auth.lock, undefined);
  await options.global.fetch('https://synthetic.supabase.co/auth/v1/token', {
    headers: { Authorization: 'Bearer sb_publishable_synthetic' },
  });
  assert.equal(requests[0].headers.has('Authorization'), false);
  assert.equal(requests[0].headers.get('apikey'), 'sb_publishable_synthetic');
  await options.global.fetch('https://synthetic.supabase.co/auth/v1/user', {
    headers: { Authorization: 'Bearer synthetic-session-token' },
  });
  assert.equal(requests[1].headers.get('Authorization'), 'Bearer synthetic-session-token');
});
