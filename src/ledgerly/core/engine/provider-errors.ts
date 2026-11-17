/**
 * Structured errors for the page-facing provider.
 *
 * Accountabul and other dApps branch on `code` (copied onto `Error.name` by the
 * inpage bridge). Messages stay human-readable for the rare case a site shows
 * them; codes stay stable for automation.
 */
export type ProviderErrorCode =
  | 'user_rejected'
  | 'wallet_locked'
  | 'wallet_setup_required'
  | 'unauthorized'
  | 'pending_request'
  | 'invalid_request'
  | 'wallet_error';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}
