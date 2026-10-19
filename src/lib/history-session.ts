/** Never restore an authenticated DOM snapshot from the browser's back/forward cache. */
export function guardHistoryRestore(
  target: Window = window,
  page: Document = document,
): () => void {
  const previousVisibility = page.documentElement.style.visibility;
  const hide = () => {
    page.documentElement.style.visibility = 'hidden';
  };
  const restore = (event: PageTransitionEvent) => {
    if (event.persisted) {
      // Reload re-runs route authorization and recreates the locked wallet worker.
      // Keep the cached DOM hidden until the new document replaces it.
      target.location.reload();
    } else {
      page.documentElement.style.visibility = previousVisibility;
    }
  };
  target.addEventListener('pagehide', hide);
  target.addEventListener('pageshow', restore);
  return () => {
    target.removeEventListener('pagehide', hide);
    target.removeEventListener('pageshow', restore);
    page.documentElement.style.visibility = previousVisibility;
  };
}
