import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Validate the current session without allowing an old request to restore a signed-out user. */
export async function readAuthEntry(auth: SupabaseClient['auth']): Promise<User | null> {
  const { data: before, error: sessionError } = await auth.getSession();
  if (sessionError) throw new Error('Could not check sign-in. Please try again.');
  if (!before.session) return null;
  const { data, error } = await auth.getUser(before.session.access_token);
  const { data: after, error: afterError } = await auth.getSession();
  if (afterError) throw new Error('Could not check sign-in. Please try again.');
  if (!after.session || after.session.access_token !== before.session.access_token) return null;
  if (error?.status === 401 || error?.status === 403) return null;
  if (error) throw new Error('Could not check sign-in. Please try again.');
  if (!data.user || data.user.id !== after.session.user.id) return null;
  return data.user;
}
