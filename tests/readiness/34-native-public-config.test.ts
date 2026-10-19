import { describe, expect, it } from 'vitest';
import { isPublicSupabaseKey } from '../../src/ledgerly/native/public-config';
describe('native client key boundary', () => {
  it('permits publishable/anon keys and rejects server-role or malformed keys', () => {
    const jwt = (role: string) =>
      ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'synthetic'].join('.');
    expect(isPublicSupabaseKey('sb_publishable_synthetic')).toBe(true);
    expect(isPublicSupabaseKey(jwt('anon'))).toBe(true);
    for (const key of [
      'sb_secret_synthetic',
      jwt('service_role'),
      jwt('authenticated'),
      '',
      'bad.jwt.input',
      'sb_publishable_',
    ])
      expect(isPublicSupabaseKey(key)).toBe(false);
  });
});
