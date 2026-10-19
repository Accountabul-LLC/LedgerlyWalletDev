import { createServerFn } from '@tanstack/react-start';

/**
 * Confirms a signup email from token_hash. The handler runs on the server so
 * the one-time hash is exchanged for a session without the PKCE verifier from
 * the browser that requested the email.
 */
export const verifyEmailToken = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => {
    const value = input as { tokenHash?: unknown; type?: unknown } | null;
    return {
      tokenHash: typeof value?.tokenHash === 'string' ? value.tokenHash : '',
      type: typeof value?.type === 'string' ? value.type : '',
    };
  })
  .handler(async ({ data }) => {
    const { confirmEmailOnServer } = await import('@/lib/confirm-email.server');
    return confirmEmailOnServer(data);
  });
