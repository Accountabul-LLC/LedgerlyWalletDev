/** Profile logout must hide and lock the local wallet before network work. */
export async function signOutAndLock(
  wallet: { lock(): Promise<void> },
  store: { lockSnapshot(): void; refresh(): Promise<unknown> },
  signOut: () => Promise<{ error: unknown | null }>,
): Promise<void> {
  store.lockSnapshot();
  await wallet.lock();
  await store.refresh();
  const result = await signOut();
  if (result.error) throw new Error('Could not sign out. Your wallet is locked.');
}
