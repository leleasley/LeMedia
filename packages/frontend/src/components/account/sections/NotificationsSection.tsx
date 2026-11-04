import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Check, Copy, Link2, Trash2 } from 'lucide-react';
import api, { posterUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Switch from '@/components/ui/Switch';
import PushNotificationCard from '@/components/account/PushNotificationCard';

interface ShareLink {
  token: string;
  url: string;
  tmdbId: number;
  mediaType: string;
  title: string | null;
  posterPath: string | null;
  views: number;
  expiresAt: string;
  createdAt: string;
}

function Toggle({ on, onFlip, label, desc }: Readonly<{ on: boolean; onFlip: () => void; label: string; desc: string }>) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-ndp-text">{label}</h3>
        <p className="text-xs text-ndp-text-dim mt-1">{desc}</p>
      </div>
      <Switch checked={on} onChange={() => onFlip()} label={label} />
    </div>
  );
}

export function NotificationsSection() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const notifyRequests = user?.notifyRequests ?? true;
  const notifyDigital = user?.notifyDigital ?? true;

  useEffect(() => {
    api.get('/share/mine')
      .then(({ data }) => setLinks(Array.isArray(data) ? data : []))
      .catch(() => setLinks([]))
      .finally(() => setLinksLoading(false));
  }, []);

  const flip = async (key: 'notifyRequests' | 'notifyDigital', next: boolean) => {
    setSaving(true);
    try {
      await api.put('/auth/me/notifications', { [key]: next });
      await refreshUser();
    } catch {
      // keep old state on failure
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${link.url}`);
      setCopiedToken(link.token);
      setTimeout(() => setCopiedToken((c) => (c === link.token ? null : c)), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const revoke = async (token: string) => {
    try {
      await api.delete(`/share/${token}`);
      setLinks((prev) => prev.filter((l) => l.token !== token));
    } catch { /* keep row on failure */ }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      <PushNotificationCard />

      {/* Bell preferences */}
      <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] p-4 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-ndp-accent/10 flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-ndp-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-ndp-text">
              {t('account.notifications.bell.title', 'Notification bell')}
            </h3>
            <p className="text-xs text-ndp-text-dim mt-1">
              {t('account.notifications.bell.desc', 'Choose which updates land in your bell.')}
            </p>
          </div>
        </div>
        <div className={saving ? 'opacity-50 pointer-events-none' : ''}>
          <Toggle
            on={notifyRequests}
            onFlip={() => void flip('notifyRequests', !notifyRequests)}
            label={t('account.notifications.requests.title', 'My requests')}
            desc={t('account.notifications.requests.desc', 'Approved, declined and available alerts for titles you requested.')}
          />
          <div className="h-px bg-white/5 my-4" />
          <Toggle
            on={notifyDigital}
            onFlip={() => void flip('notifyDigital', !notifyDigital)}
            label={t('account.notifications.digital.title', 'Digital releases')}
            desc={t('account.notifications.digital.desc', 'Newly found dates and release-day alerts for requested movies.')}
          />
        </div>
      </div>

      {/* Shared links */}
      <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] p-4">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 rounded-lg bg-ndp-accent/10 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-5 h-5 text-ndp-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-ndp-text">
              {t('account.notifications.links.title', 'Shared links')}
            </h3>
            <p className="text-xs text-ndp-text-dim mt-1">
              {t('account.notifications.links.desc', 'Links you created from info pages. Revoking kills the link instantly.')}
            </p>
          </div>
        </div>
        {linksLoading ? (
          <p className="text-xs text-ndp-text-dim">{t('common.loading', 'Loading...')}</p>
        ) : links.length === 0 ? (
          <p className="text-xs text-ndp-text-dim">
            {t('account.notifications.links.empty', 'No shared links yet, use Share on any info page.')}
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <li key={link.token} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03]">
                <div className="w-8 h-12 rounded-md overflow-hidden bg-ndp-surface-light flex-shrink-0">
                  {link.posterPath ? (
                    <img src={posterUrl(link.posterPath, 'w92')} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ndp-text truncate">
                    {link.title || `/${link.mediaType}/${link.tmdbId}`}
                  </p>
                  <p className="text-[11px] text-ndp-text-dim mt-0.5">
                    {link.views} {t('account.notifications.links.views', 'views')} · {t('account.notifications.links.expires', 'expires')} {fmtDate(link.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyLink(link)}
                  aria-label={t('common.copy', 'Copy')}
                  className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
                >
                  {copiedToken === link.token ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void revoke(link.token)}
                  aria-label={t('common.delete', 'Delete')}
                  className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
