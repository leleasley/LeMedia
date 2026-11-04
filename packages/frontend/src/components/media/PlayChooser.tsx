import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { ChevronRight, Copy, ExternalLink, Loader2, Play, X } from 'lucide-react';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { showToast } from '@/utils/toast';

interface PlayLinks {
  title: string | null;
  plezy: string;
  plex: { app: string; web: string; server: string } | null;
  infuse: string | null;
  stream: string | null;
}

type AppId = 'plezy' | 'plex' | 'plexweb' | 'infuse';
const PREF_KEY = 'lemedia-play-app';

const isMobile = typeof navigator !== 'undefined' && /iphone|ipad|ipod|android/i.test(navigator.userAgent);
const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/** Store pages for when an app link goes nowhere (app missing, or too old for links). */
const STORE: Record<Exclude<AppId, 'plexweb'>, { ios: string; android?: string }> = {
  plezy: { ios: 'https://apps.apple.com/app/id6754315964', android: 'https://play.google.com/store/apps/details?id=com.edde746.plezy' },
  plex: { ios: 'https://apps.apple.com/app/id383457673', android: 'https://play.google.com/store/apps/details?id=com.plexapp.android' },
  infuse: { ios: 'https://apps.apple.com/app/id1136220934' },
};
// Fallback for iOS home-screen apps that won't hand plezy:// / plex:// / infuse:// to the app:
// route the link through LeMedia's /open page in a Safari sheet instead. Off by default: with the
// apps installed and up to date, direct links work from the home-screen app too (checked on an
// iPhone 2026-10-29). Flip to true if "address is invalid" comes back in the home-screen app.
const USE_OPEN_PAGE_ON_IOS = false;
const isIosHomeScreenApp = USE_OPEN_PAGE_ON_IOS && typeof navigator !== 'undefined'
  && /iphone|ipad|ipod/i.test(navigator.userAgent)
  && ((navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches);

/** href + target for an app link, routed via /open where iOS needs it. */
function linkProps(app: AppId, url: string): { href: string; target?: string; rel?: string } {
  if (app === 'plexweb') return { href: url, target: '_blank', rel: 'noopener noreferrer' };
  if (isIosHomeScreenApp) return { href: `/open?to=${encodeURIComponent(url)}`, target: '_blank', rel: 'noopener' };
  return { href: url };
}

const storeUrl = (app: AppId) => (app === 'plexweb' ? null : (isAndroid ? STORE[app].android : STORE[app].ios) ?? null);

/** Watches whether the page loses focus soon after an app link was tapped — the only signal a
 *  web page gets that another app took over. When nothing happens the app isn't there (Safari
 *  shows its "address is invalid" alert), so the caller can offer the store instead.
 *  The navigation itself is a real <a href> the user taps: iOS (home-screen apps especially)
 *  only reliably hands custom schemes like plezy:// to another app from a genuine link tap. */
function watchForHandoff(onMissed: () => void) {
  let left = false;
  const mark = () => { left = true; };
  document.addEventListener('visibilitychange', mark, { once: true });
  window.addEventListener('pagehide', mark, { once: true });
  window.addEventListener('blur', mark, { once: true });
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', mark);
    window.removeEventListener('pagehide', mark);
    window.removeEventListener('blur', mark);
    if (!left && document.visibilityState === 'visible') onMissed();
  }, 4000);
}

function urlFor(links: PlayLinks, app: AppId): string | null {
  switch (app) {
    case 'plezy': return links.plezy;
    case 'plex': return links.plex?.app ?? null;
    case 'plexweb': return links.plex?.web ?? null;
    case 'infuse': return links.infuse;
  }
}


/** "Play" — pick the app to watch in (Plezy, Plex, Infuse, or copy the stream for UHF/VLC).
 *  The choice can be remembered, after which Play opens that app straight away. */
export function PlayChooser({ mediaType, tmdbId }: Readonly<{ mediaType: 'movie' | 'tv'; tmdbId: number }>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<PlayLinks | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [missed, setMissed] = useState<AppId | null>(null);

  const [saved, setSaved] = useState<AppId | null>(() => localStorage.getItem(PREF_KEY) as AppId | null);

  // Load the links with the page, so Play can be a real link the moment it's tapped.
  const fetchLinks = async (quiet = false): Promise<PlayLinks | null> => {
    if (links) return links;
    setLoading(true);
    try {
      const { data } = await api.get<PlayLinks>(`/play/${mediaType}/${tmdbId}`);
      setLinks(data);
      return data;
    } catch {
      if (!quiet) showToast(t('play.failed', 'Could not get the play links'), 'error');
      return null;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetchLinks(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mediaType, tmdbId]);

  /** Runs as the user taps an app link (the browser follows the href itself). */
  const tapped = (app: AppId) => {
    if (remember) {
      localStorage.setItem(PREF_KEY, app);
      setSaved(app);
      showToast(t('play.remembered', 'Play will open this app from now on, change it any time from the menu next to Play'), 'info');
    }
    setOpen(false);
    setMissed(null);
    if (app !== 'plexweb' && !isIosHomeScreenApp) watchForHandoff(() => { setMissed(app); setOpen(true); });
  };

  const openChooser = async () => {
    if (!(await fetchLinks())) return;
    setRemember(false);
    setMissed(null);
    setOpen(true);
  };

  const quickUrl = saved && links ? urlFor(links, saved) : null;

  const copyStream = async () => {
    if (!links?.stream) return;
    try {
      await navigator.clipboard.writeText(links.stream);
      showToast(t('play.copied', 'Stream link copied, paste it into UHF, VLC or another player'), 'success');
    } catch {
      window.prompt(t('play.copy_prompt', 'Copy this link'), links.stream);
    }
  };

  const options: { id: AppId; name: string; sub: string; icon: string; available: boolean; recommended?: boolean }[] = links ? [
    { id: 'plezy', name: 'Plezy', sub: t('play.plezy_sub', 'Opens it in Plezy'), icon: '/apps/plezy.png', available: true, recommended: true },
    { id: 'plex', name: t('play.plex_app', 'Plex app'), sub: links.plex ? t('play.plex_sub', 'On {{server}}', { server: links.plex.server }) : t('play.not_on_rex', 'Not found on the Plex server yet'), icon: '/apps/plex.png', available: !!links.plex && isMobile },
    { id: 'plexweb', name: t('play.plex_web', 'Plex in the browser'), sub: t('play.plex_web_sub', 'app.plex.tv'), icon: '/apps/plex.png', available: !!links.plex },
    { id: 'infuse', name: 'Infuse', sub: mediaType === 'movie' ? t('play.infuse_sub', 'Plays the file directly · home network') : t('play.movies_only', 'Movies only for now'), icon: '/apps/infuse.png', available: !!links.infuse },
  ] : [];
  const missedName = missed ? options.find((o) => o.id === missed)?.name ?? '' : '';
  const missedStore = missed ? storeUrl(missed) : null;

  return (
    <>
      {saved && quickUrl ? (
        <a
          {...linkProps(saved, quickUrl)}
          onClick={() => tapped(saved)}
          className="btn-primary flex items-center gap-2 !px-5"
        >
          <Play className="w-4 h-4 fill-current" />
          {t('play.play', 'Play')}
        </a>
      ) : (
        <button type="button" onClick={() => void openChooser()} disabled={loading && !links} className="btn-primary flex items-center gap-2 !px-5">
          {loading && !links ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
          {t('play.play', 'Play')}
        </button>
      )}
      {saved && (
        <button
          type="button"
          onClick={async () => { const d = await fetchLinks(); if (d) { localStorage.removeItem(PREF_KEY); setSaved(null); setOpen(true); } }}
          className="btn-secondary !px-3"
          aria-label={t('play.choose_app', 'Choose app')}
          title={t('play.choose_app', 'Choose app')}
        >
          <ChevronRight className="w-4 h-4 rotate-90" />
        </button>
      )}

      {open && links && createPortal(
        <div className="modal-overlay z-[60]" onClick={() => setOpen(false)}>
          <div className="modal-panel w-full max-w-md px-4 pt-6 pb-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('play.title', 'Watch in')}>
            <div className="flex items-start justify-between gap-3 mb-4 px-1">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ndp-text">{t('play.title', 'Watch in')}</h2>
                {links.title && <p className="text-sm text-ndp-text-dim truncate">{links.title}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close', 'Close')} className="w-9 h-9 -mr-1 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5">
                <X className="w-5 h-5" />
              </button>
            </div>

            {missed && (
              <div className="mb-3 rounded-xl bg-amber-500/10 ring-1 ring-inset ring-amber-500/25 px-3.5 py-3">
                <p className="text-sm font-medium text-amber-200">{t('play.missed_title', '{{app}} didn\'t open?', { app: missedName })}</p>
                <p className="text-xs text-amber-100/70 mt-1 leading-relaxed">
                  {missed === 'plezy'
                    ? t('play.missed_plezy', 'Plezy needs version 2.25 or newer for links, update it from the App Store, or pick another app below.')
                    : t('play.missed_generic', 'It doesn\'t look installed on this device. Install it, or pick another app below.')}
                </p>
                {missedStore && (
                  <a href={missedStore} target="_blank" rel="noopener noreferrer" className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs font-semibold text-ndp-text">
                    <ExternalLink className="w-3.5 h-3.5" />
                    {isAndroid ? t('play.get_play', 'Get it on Google Play') : t('play.get_app_store', 'Open the App Store')}
                  </a>
                )}
              </div>
            )}

            <div className="admin-group divide-y divide-white/[0.06]">
              {options.map((o) => {
                const url = o.available ? urlFor(links, o.id) : null;
                return (
                <a
                  key={o.id}
                  {...(url ? linkProps(o.id, url) : {})}
                  aria-disabled={!url}
                  onClick={(e) => { if (!url) { e.preventDefault(); return; } tapped(o.id); }}
                  className={clsx('admin-row w-full text-left transition-colors', url ? 'hover:bg-white/[0.04] active:bg-white/[0.07]' : 'opacity-45 cursor-not-allowed')}
                >
                  <span className="relative w-10 h-10 flex-shrink-0">
                    <img src={o.icon} alt="" className="w-10 h-10 rounded-[22%] ring-1 ring-inset ring-white/10" />
                    {o.id === 'plexweb' && (
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-ndp-surface ring-2 ring-ndp-surface flex items-center justify-center">
                        <ExternalLink className="w-3 h-3 text-ndp-text-muted" />
                      </span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 text-[15px] font-medium text-ndp-text">
                      {o.name}
                      {o.recommended && <span className="admin-chip bg-ndp-accent/15 text-ndp-accent">{t('play.best', 'Best on iPhone')}</span>}
                    </span>
                    <span className="block text-xs text-ndp-text-dim truncate">{o.id === 'plex' && links.plex && !isMobile ? t('play.phone_only', 'On a phone or tablet') : o.sub}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-ndp-text-dim" />
                </a>
                );
              })}
              <button type="button" disabled={!links.stream} onClick={() => void copyStream()} className={clsx('admin-row w-full text-left transition-colors', links.stream ? 'hover:bg-white/[0.04] active:bg-white/[0.07]' : 'opacity-45 cursor-not-allowed')}>
                <span className="admin-icon-tile w-9 h-9"><Copy className="w-4 h-4" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium text-ndp-text">{t('play.copy_stream', 'Copy stream link')}</span>
                  <span className="block text-xs text-ndp-text-dim truncate">{links.stream ? t('play.copy_sub', 'For UHF, VLC and other players · home network') : t('play.movies_only', 'Movies only for now')}</span>
                </span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 mt-3 px-1">
              <span className="text-sm text-ndp-text-muted">{t('play.remember', 'Remember my choice')}</span>
              <Switch checked={remember} onChange={setRemember} label={t('play.remember', 'Remember my choice')} className="-mr-1.5" />
            </div>
            <p className="admin-hint">{t('play.hint', 'Plezy and the Plex app need to be installed and signed in to an account with access to the server.')}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
