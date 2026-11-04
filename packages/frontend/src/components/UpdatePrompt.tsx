import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, X } from 'lucide-react';

/** Offers a user-initiated reload when a newer bundle has been deployed.
 *
 *  Deliberately NOT a `controllerchange` auto-reload (see the note in main.tsx): the PWA can sit
 *  resident on a phone for days, so the running JS keeps serving an old build with nothing to
 *  make the user aware. We compare the hashed entry script that the *live* index.html references
 *  against the one this document is actually running, and surface a dismissible bar.
 *  The reload happens only when the user taps it — never automatically. */

const ENTRY_RE = /assets\/index-[A-Za-z0-9_-]+\.js/;

/** The entry chunk this document is running, as referenced by its own <script src>. */
function runningEntry(): string | null {
  const el = document.querySelector('script[type="module"][src*="/assets/index-"]');
  const src = el?.getAttribute('src') ?? '';
  return src.match(ENTRY_RE)?.[0] ?? null;
}

export default function UpdatePrompt() {
  const { t } = useTranslation();
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      // Only worth checking while the user is actually looking at the app.
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`/index.html?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const deployed = (await res.text()).match(ENTRY_RE)?.[0] ?? null;
        const current = runningEntry();
        if (!cancelled && deployed && current && deployed !== current) setStale(true);
      } catch {
        // Offline or fetch blocked — the next focus/interval retries.
      }
    };

    check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!stale || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-xl bg-ndp-surface border border-white/15 shadow-2xl shadow-black/50 px-4 py-2.5 max-w-[calc(100vw-2rem)]"
      // Cleared above the mobile bottom nav (h-14 + safe area) so it never sits under the tab bar.
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 72px)' }}
    >
      <RefreshCw className="w-4 h-4 text-ndp-accent flex-shrink-0" />
      <span className="text-sm text-ndp-text">{t('common.update_available')}</span>
      <button
        onClick={() => window.location.reload()}
        className="text-sm font-semibold text-ndp-accent hover:underline flex-shrink-0"
      >
        {t('common.reload')}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label={t('common.close')}
        className="text-ndp-text-dim hover:text-ndp-text flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
