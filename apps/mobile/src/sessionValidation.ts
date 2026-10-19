export const VALIDATION_RETRY_COPY =
  'Account validation is temporarily unavailable. Your saved sign-in stays on this device.';

const RETRYABLE_AUTH_CODES = new Set([
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'request_timeout',
]);

const INVALID_AUTH_CODES = new Set([
  'bad_jwt',
  'invalid_jwt',
  'session_not_found',
  'user_not_found',
  'user_banned',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_expired',
]);

/** Retryable failures keep stored credentials. Only an invalid token is cleared. */
export function validationFailureKind(error: unknown): 'retryable' | 'invalid' {
  if (!error || typeof error !== 'object') return 'invalid';
  const detail = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  const name = typeof detail.name === 'string' ? detail.name : '';
  const code = typeof detail.code === 'string' ? detail.code : '';
  const status = typeof detail.status === 'number' ? detail.status : null;
  const message = typeof detail.message === 'string' ? detail.message : '';
  if (
    name === 'AuthRetryableFetchError' ||
    name === 'AbortError' ||
    status === 0 ||
    status === 408 ||
    status === 429 ||
    (status !== null && status >= 500) ||
    RETRYABLE_AUTH_CODES.has(code) ||
    /timeout|network request failed|failed to fetch|fetch failed/i.test(message)
  )
    return 'retryable';
  if (status === 401 || status === 403 || INVALID_AUTH_CODES.has(code)) return 'invalid';
  return 'retryable';
}
