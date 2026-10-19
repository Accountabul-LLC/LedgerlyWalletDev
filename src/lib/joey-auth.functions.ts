import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { CLASSIC_ADDRESS_PATTERN } from '@/lib/ingest-guards';
import {
  JOEY_CHALLENGE_TTL_MS,
  JOEY_CHALLENGE_WINDOW_MS,
  JOEY_MAX_CHALLENGES_PER_WINDOW,
  JOEY_SIGN_IN_STATEMENT,
  assertJoeySignInMatchesSite,
  hashJoeyNonce,
  parseJoeySignInMessage,
} from '@/lib/joey-auth';

const proofSchema = z.object({
  address: z.string().regex(CLASSIC_ADDRESS_PATTERN),
  publicKey: z.string().regex(/^(?:ED[0-9A-Fa-f]{64}|0[23][0-9A-Fa-f]{64})$/),
  signature: z.string().regex(/^[0-9A-Fa-f]{128,144}$/),
  message: z.string().min(1).max(4096),
});

/** The host of this request, never a caller-supplied Origin or forwarded host. */
function requestHost(): string {
  const request = getRequest();
  try {
    return new URL(request.url).host.toLowerCase();
  } catch {
    throw new Error('Could not identify this Ledgerly site.');
  }
}

export const createJoeyChallenge = createServerFn({ method: 'POST' }).handler(async () => {
  const domain = requestHost();
  const { randomBytes } = await import('node:crypto');
  const nonce = randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = new Date(now + JOEY_CHALLENGE_TTL_MS).toISOString();
  const windowStart = new Date(now - JOEY_CHALLENGE_WINDOW_MS).toISOString();
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  await supabaseAdmin
    .from('joey_auth_nonces')
    .delete()
    .lt('expires_at', new Date(now).toISOString());
  const { count, error: countError } = await supabaseAdmin
    .from('joey_auth_nonces')
    .select('nonce_hash', { count: 'exact', head: true })
    .gt('created_at', windowStart);
  if (countError) throw new Error('Could not start Joey sign-in. Please try again.');
  if ((count ?? 0) >= JOEY_MAX_CHALLENGES_PER_WINDOW) {
    throw new Error('Too many Joey sign-in attempts. Please wait a minute and try again.');
  }
  const { error } = await supabaseAdmin.from('joey_auth_nonces').insert({
    nonce_hash: hashJoeyNonce(nonce),
    requested_domain: domain,
    expires_at: expiresAt,
  });
  if (error) throw new Error('Could not start Joey sign-in. Please try again.');
  return { nonce, statement: JOEY_SIGN_IN_STATEMENT };
});

export const verifyJoeySignIn = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }) => {
    const expectedHost = requestHost();
    const parsed = parseJoeySignInMessage(data.message);
    if (parsed.address !== data.address)
      throw new Error('The Joey address does not match the approval.');
    assertJoeySignInMatchesSite(parsed, expectedHost);

    const { deriveAddress, verify } = await import('ripple-keypairs');
    const publicKey = data.publicKey.toUpperCase();
    if (deriveAddress(publicKey) !== data.address) {
      throw new Error('The Joey public key does not belong to that address.');
    }
    const messageHex = Buffer.from(data.message, 'utf8').toString('hex').toUpperCase();
    if (!verify(messageHex, data.signature.toUpperCase(), publicKey)) {
      throw new Error('Joey could not prove control of that wallet.');
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const usedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await supabaseAdmin
      .from('joey_auth_nonces')
      .update({ used_at: usedAt })
      .eq('nonce_hash', hashJoeyNonce(parsed.nonce))
      .eq('requested_domain', expectedHost)
      .is('used_at', null)
      .gt('expires_at', usedAt)
      .select('nonce_hash')
      .maybeSingle();
    if (consumeError || !consumed) {
      throw new Error('That Joey approval was already used or has expired. Please try again.');
    }

    // Supabase supplies the profile session used by the rest of Ledgerly. The
    // synthetic address is private auth plumbing and is never displayed or mailed.
    const identity = hashJoeyNonce(data.address);
    const email = `joey-${identity}@wallet.ledgerly.invalid`;
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        data: { auth_provider: 'joey', xrpl_address: data.address, display_name: 'Joey Wallet' },
      },
    });
    if (linkError || !link.properties.hashed_token) {
      throw new Error('Joey was verified, but Ledgerly could not open your profile.');
    }
    const { error: labelError } = await supabaseAdmin.from('wallet_labels').upsert(
      {
        user_id: link.user.id,
        address: data.address,
        name: 'Joey Wallet',
        provider: 'joey',
        removed_at: null,
      },
      { onConflict: 'user_id,address' },
    );
    if (labelError) throw new Error('Joey was verified, but its address could not be saved.');
    return {
      tokenHash: link.properties.hashed_token,
      address: data.address,
    };
  });
