/** Only publishable/anon credentials may enter a client build. Never echo rejected input. */
export function isPublicSupabaseKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return payload !== null && typeof payload === 'object' && payload.role === 'anon';
  } catch {
    return false;
  }
}
