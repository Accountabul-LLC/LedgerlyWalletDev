/**
 * A profile is verified only after Supabase records email_confirmed_at.
 * OAuth and magic-link sign-in set that timestamp when the provider or
 * verifyOtp confirms the address. A password signup does not, until the
 * person opens the confirmation link.
 */
export function isEmailConfirmed(
  user: { email_confirmed_at?: string | null } | null | undefined,
): boolean {
  return typeof user?.email_confirmed_at === 'string' && user.email_confirmed_at.length > 0;
}

export function isVerifiedSession(
  session: { user?: { email_confirmed_at?: string | null } | null } | null | undefined,
): boolean {
  return isEmailConfirmed(session?.user);
}
