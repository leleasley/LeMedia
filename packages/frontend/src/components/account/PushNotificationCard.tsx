import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowUpCircle, BellRing, ListPlus, Puzzle, CalendarClock, CheckCircle2, Clapperboard, Disc3, Loader2, Send, Share, SquarePlus, XCircle, type LucideIcon } from 'lucide-react';
import api from '@/lib/api';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import Switch from '@/components/ui/Switch';
import { showToast } from '@/utils/toast';
import { useAuth } from '@/context/AuthContext';

const isIOS = typeof navigator !== 'undefined'
  && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const isStandalone = typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

type PushType = 'request_approved' | 'request_declined' | 'media_available' | 'digital_release_discovered' | 'digital_release_day' | 'acquisition_stalled' | 'list_added' | 'app_update' | 'zurg_broken';

/** Each switchable notification type, in the order shown. The icon mirrors the emoji used in
 *  the notification itself (✅ ❌ 🎬 📅 💿). */
/** Server events, only offered to admins (the server only sends them to admins). */
const ADMIN_PUSH_ROWS: { type: PushType; icon: LucideIcon; tone: string; labelKey: string; label: string }[] = [
  { type: 'list_added', icon: ListPlus, tone: 'bg-emerald-500/15 text-emerald-400', labelKey: 'account.push.type.list_added', label: 'A list added titles' },
  { type: 'app_update', icon: ArrowUpCircle, tone: 'bg-sky-500/15 text-sky-400', labelKey: 'account.push.type.app_update', label: 'App updates (Sonarr, Radarr, Prowlarr, Zurg, rex)' },
  { type: 'zurg_broken', icon: Puzzle, tone: 'bg-orange-500/15 text-orange-400', labelKey: 'account.push.type.zurg_broken', label: 'Zurg releases that broke' },
];

const PUSH_TYPE_ROWS: { type: PushType; icon: LucideIcon; tone: string; labelKey: string; label: string }[] = [
  { type: 'request_approved', icon: CheckCircle2, tone: 'bg-emerald-500/15 text-emerald-400', labelKey: 'account.push.type.approved', label: 'Request approved' },
  { type: 'request_declined', icon: XCircle, tone: 'bg-red-500/15 text-red-400', labelKey: 'account.push.type.declined', label: 'Request declined' },
  { type: 'media_available', icon: Clapperboard, tone: 'bg-ndp-accent/15 text-ndp-accent', labelKey: 'account.push.type.available', label: 'Ready to watch' },
  { type: 'digital_release_discovered', icon: CalendarClock, tone: 'bg-sky-500/15 text-sky-400', labelKey: 'account.push.type.digital_date', label: 'Digital date found' },
  { type: 'digital_release_day', icon: Disc3, tone: 'bg-sky-500/15 text-sky-400', labelKey: 'account.push.type.digital_day', label: 'Out on digital' },
  { type: 'acquisition_stalled', icon: AlertTriangle, tone: 'bg-amber-500/15 text-amber-400', labelKey: 'account.push.type.stalled', label: 'Couldn\'t find a release' },
];

/** Per-device phone/desktop push toggle. iOS only allows web push for the Home Screen app,
 *  and only after a tap — so this explains the "why not" states instead of hiding itself. */
export default function PushNotificationCard() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('admin.*');
  const push = usePushNotifications();
  const [testing, setTesting] = useState(false);
  const [prefs, setPrefs] = useState<Record<PushType, boolean> | null>(null);

  // Which types reach this user's devices (stored per user, applies to every device).
  useEffect(() => {
    if (!push.subscribed) return;
    api.get('/auth/me/push-prefs').then(({ data }) => setPrefs(data)).catch(() => {});
  }, [push.subscribed]);

  const setPref = async (type: PushType, on: boolean) => {
    const previous = prefs;
    setPrefs((p) => (p ? { ...p, [type]: on } : p));
    try {
      const { data } = await api.put('/auth/me/push-prefs', { [type]: on });
      setPrefs(data);
    } catch {
      setPrefs(previous);
      showToast(t('account.push.pref_failed', 'Could not save that setting'), 'error');
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const { data } = await api.post('/push/test');
      if (data?.sent > 0) showToast(t('account.push.test_sent', 'Test sent, check your notifications'), 'success');
      else showToast(t('account.push.test_failed', 'Could not deliver to this device. Try turning notifications off and on again.'), 'error');
    } catch {
      showToast(t('account.push.test_failed', 'Could not deliver to this device. Try turning notifications off and on again.'), 'error');
    } finally {
      setTesting(false);
    }
  };

  const toggle = async () => {
    if (push.subscribed) {
      await push.unsubscribe();
      return;
    }
    const ok = await push.subscribe();
    if (ok) showToast(t('account.push.enabled', 'Notifications turned on for this device'), 'success');
    else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') showToast(t('account.push.enable_failed', 'Could not turn on notifications'), 'error');
  };

  // iPhone/iPad in a Safari tab: push only exists inside the Home Screen app.
  const needsInstall = isIOS && !isStandalone;
  const blocked = push.supported && push.permission === 'denied';

  return (
    <section>
      <h3 className="admin-group-label">{t('account.push.title', 'Phone notifications')}</h3>
      <div className="admin-group divide-y divide-white/[0.06]">
        <div className="admin-row">
          <span className="admin-icon-tile bg-ndp-accent/15 text-ndp-accent"><BellRing className="w-[17px] h-[17px]" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-ndp-text">{t('account.push.row', 'Notifications on this device')}</p>
            <p className="text-xs text-ndp-text-dim mt-0.5">
              {push.subscribed
                ? t('account.push.on', 'On, you\'ll be told when requests are approved, declined or ready to watch.')
                : t('account.push.off', 'Get an alert when your requests are approved, declined or ready to watch.')}
            </p>
          </div>
          {push.supported && !blocked && (
            push.loading
              ? <span className="w-14 h-10 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-ndp-text-dim" /></span>
              : <Switch checked={push.subscribed} onChange={() => void toggle()} label={t('account.push.row', 'Notifications on this device')} className="-mr-1.5" />
          )}
        </div>

        {push.subscribed && (
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={testing}
            className="admin-row w-full text-left hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors disabled:opacity-60"
          >
            <span className="admin-icon-tile">{testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</span>
            <span className="flex-1 text-[15px] font-medium text-ndp-accent">{t('account.push.test', 'Send a test notification')}</span>
          </button>
        )}

      </div>

      {push.subscribed && prefs && (
        <>
          <h3 className="admin-group-label mt-6">{t('account.push.types_title', 'Send me')}</h3>
          <div className="admin-group divide-y divide-white/[0.06]">
            {PUSH_TYPE_ROWS.map(({ type, icon: Icon, tone, labelKey, label }) => (
              <div key={type} className="admin-row">
                <span className={`admin-icon-tile ${tone}`}><Icon className="w-[17px] h-[17px]" /></span>
                <span className="flex-1 min-w-0 text-[15px] font-medium text-ndp-text">{t(labelKey, label)}</span>
                <Switch checked={prefs[type]} onChange={(on) => void setPref(type, on)} label={t(labelKey, label)} className="-mr-1.5" />
              </div>
            ))}
          </div>
          {isAdmin && (
            <>
              <h3 className="admin-group-label mt-6">{t('account.push.server_title', 'Server (admins)')}</h3>
              <div className="admin-group divide-y divide-white/[0.06]">
                {ADMIN_PUSH_ROWS.map(({ type, icon: Icon, tone, labelKey, label }) => (
                  <div key={type} className="admin-row">
                    <span className={`admin-icon-tile ${tone}`}><Icon className="w-[17px] h-[17px]" /></span>
                    <span className="flex-1 min-w-0 text-[15px] font-medium text-ndp-text">{t(labelKey, label)}</span>
                    <Switch checked={prefs[type] ?? true} onChange={(on) => void setPref(type, on)} label={t(labelKey, label)} className="-mr-1.5" />
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="admin-hint">{t('account.push.types_hint', 'Applies to every device you\'ve turned notifications on for. Tapping a notification opens that movie or series.')}</p>
        </>
      )}

      <div className="admin-group divide-y divide-white/[0.06] empty:hidden mt-0">
        {needsInstall && (
          <div className="admin-row items-start">
            <span className="admin-icon-tile"><SquarePlus className="w-4 h-4" /></span>
            <p className="flex-1 text-sm text-ndp-text-muted leading-relaxed">
              {t('account.push.install_hint_1', 'On iPhone, notifications only work from the Home Screen app. In Safari tap')}{' '}
              <Share className="inline w-4 h-4 -mt-0.5 text-ndp-text" />{' '}
              {t('account.push.install_hint_2', 'Share → Add to Home Screen, then open LeMedia from the new icon and turn this on.')}
            </p>
          </div>
        )}

        {!needsInstall && !push.supported && !push.loading && (
          <p className="admin-row text-sm text-ndp-text-muted">{t('account.push.unsupported', 'This browser doesn\'t support push notifications.')}</p>
        )}

        {blocked && (
          <p className="admin-row items-start text-sm text-ndp-text-muted leading-relaxed">
            {isIOS
              ? t('account.push.blocked_ios', 'Notifications are blocked for LeMedia. Turn them on in iPhone Settings → Notifications → LeMedia, or remove the app from your Home Screen and add it again.')
              : t('account.push.blocked', 'Notifications are blocked for this site. Allow them in your browser\'s site settings, then come back here.')}
          </p>
        )}
      </div>
      <p className="admin-hint">{t('account.push.hint', 'This is per device, turn it on separately on each phone or computer.')}</p>
    </section>
  );
}
