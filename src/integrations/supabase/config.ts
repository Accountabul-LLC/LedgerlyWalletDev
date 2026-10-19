/** Publishable coordinates only. Never use a privileged key in the browser. */
export function getPublicSupabaseConfig() {
  const url =
    import.meta.env['VITE_SUPABASE_URL'] ||
    (typeof process !== 'undefined' ? process.env['SUPABASE_URL'] : undefined);
  const key =
    import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ||
    (typeof process !== 'undefined' ? process.env['SUPABASE_PUBLISHABLE_KEY'] : undefined);
  if (!url || !key) throw new Error('Sign-in is temporarily unavailable. Please try again later.');
  if (key.startsWith('sb_secret_'))
    throw new Error('A server-only key cannot be used for browser authentication.');
  if (key.startsWith('eyJ')) {
    let role: unknown;
    try {
      role = JSON.parse(atob((key.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))).role;
    } catch {
      /* Supabase validates malformed public keys. */
    }
    if (role === 'service_role')
      throw new Error('A server-only key cannot be used for browser authentication.');
  }
  return { url: url.replace(/\/$/, ''), key };
}
