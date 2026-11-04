import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * SPA scroll restoration for BrowserRouter.
 *
 * Why this exists: the app previously did `window.scrollTo({ top: 0, behavior: 'smooth' })`
 * on desktop only, on every pathname change — including BACK. That broke the PWA/iOS
 * swipe-back gesture two ways:
 *  1. Forward nav on mobile kept the old scrollY (detail pages opened mid-page).
 *  2. Back nav either animated to top (desktop) or relied on the browser's native
 *     restoration, which fires before async rows/images expand the page — so you land
 *     "halfway" up instead of where you were.
 *
 * Behaviour:
 *  - PUSH (new page, incl. /movie/:id → /movie/:other): jump to top instantly.
 *  - POP (back/forward, incl. in-app back button): restore the exact Y we left,
 *    re-applying until the page height settles so late-loading rows/images don't
 *    strand us mid-page (cap ~3s; a deliberate user scroll takes over).
 *  - REPLACE on the same pathname (e.g. admin `?tab=` switches): leave scroll alone.
 */
export function useScrollRestoration() {
  const location = useLocation();
  const navType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const currentKey = useRef(location.key);
  const pathnameRef = useRef(location.pathname);
  const restoreTimers = useRef<number[]>([]);

  // Take manual control — the browser's native restoration races our async content.
  useEffect(() => {
    try {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    } catch {
      /* non-browser / restricted context */
    }
  }, []);

  // Continuously remember where we are for the current history entry, so POP can
  // come back to it. rAF-throttled to avoid writing on every pixel.
  useEffect(() => {
    let ticking = false;
    const save = () => {
      ticking = false;
      positions.current.set(currentKey.current, window.scrollY);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(save);
      }
    };
    positions.current.set(currentKey.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Runs on every history entry change (location.key is unique per entry).
  useEffect(() => {
    // Persist the outgoing position synchronously before switching keys.
    positions.current.set(currentKey.current, window.scrollY);
    const pathnameChanged = pathnameRef.current !== location.pathname;
    pathnameRef.current = location.pathname;
    currentKey.current = location.key;

    // Cancel any pending restore retries from a previous navigation.
    restoreTimers.current.forEach((t) => window.clearTimeout(t));
    restoreTimers.current = [];

    if (navType === 'POP') {
      const savedY = positions.current.get(location.key) ?? 0;
      const startedAt = Date.now();
      let cancelled = false;
      const cancel = () => {
        // Ignore gestures in the first 400ms (the tap that triggered back) —
        // only a later, deliberate scroll takes over from the restore.
        if (Date.now() - startedAt > 400) cancelled = true;
      };
      // If the user grabs the page during restore, stop fighting them.
      window.addEventListener('wheel', cancel, { passive: true });
      window.addEventListener('touchmove', cancel, { passive: true });
      const cleanup = () => {
        restoreTimers.current.forEach((t) => window.clearTimeout(t));
        restoreTimers.current = [];
        window.removeEventListener('wheel', cancel);
        window.removeEventListener('touchmove', cancel);
      };

      const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const apply = () => {
        if (!cancelled) window.scrollTo(0, Math.min(savedY, maxY()));
      };
      // Immediate + next-frame (beats the fade-in remount), then keep re-applying
      // while async rows/posters are still expanding the page. Restoring an absolute
      // Y into a half-loaded page clamps mid-page — that clamp was the "halfway" bug.
      apply();
      requestAnimationFrame(apply);
      let lastHeight = -1;
      let stablePasses = 0;
      const tick = () => {
        if (cancelled) {
          cleanup();
          return;
        }
        const h = document.documentElement.scrollHeight;
        const atTarget = Math.abs(window.scrollY - Math.min(savedY, maxY())) < 2;
        stablePasses = h === lastHeight && atTarget ? stablePasses + 1 : 0;
        lastHeight = h;
        if (stablePasses >= 2 || Date.now() - startedAt > 3000) {
          cleanup();
          return;
        }
        apply();
        restoreTimers.current.push(window.setTimeout(tick, 150));
      };
      restoreTimers.current.push(window.setTimeout(tick, 150));
      return cleanup;
    }

    // Opening the search overlay pushes a same-path entry (so back closes it) — that must
    // not jump the page underneath to the top.
    const overlayEntry = !pathnameChanged && !!(location.state as { searchOverlay?: boolean } | null)?.searchOverlay;
    if (!overlayEntry && (pathnameChanged || navType === 'PUSH')) {
      // New page (or new search query) → start at top, instantly — smooth would
      // race a quick back-swipe and strand us halfway.
      // REPLACE on the same pathname (admin tab switches, query cleanup) keeps position.
      window.scrollTo(0, 0);
    }
    return undefined;
  }, [location.key, location.pathname, location.search, location.state, navType]);
}
