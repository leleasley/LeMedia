import { lazy } from 'react';

/**
 * Route-level lazy() that survives deploys. After a new build rotates Vite's hashed chunk
 * names, a running tab can still reference the old chunks: the import fails (previously with
 * HTML served as JS, now a clean 404) and React would crash into the error boundary. A
 * single reload fetches a fresh index.html whose chunks exist — so do that automatically
 * instead of showing "Something went wrong". Guarded by timestamp so a genuinely broken
 * chunk can't reload-loop the tab.
 */
export function lazyWithReload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      try {
        const key = 'lemedia-chunk-reloaded-at';
        const last = Number(sessionStorage.getItem(key) || 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      } catch {
        /* storage-less context — fall through to the error boundary */
      }
      throw err;
    }),
  );
}
