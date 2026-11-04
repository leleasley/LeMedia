import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Eye, EyeOff } from 'lucide-react';
import i18n from '@/i18n';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface PreferencesSectionProps {
  viewAsRole: string | null;
  onViewAsRoleChange: (role: string | null) => void;
}

export function PreferencesSection({ viewAsRole, onViewAsRoleChange }: Readonly<PreferencesSectionProps>) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManageRoles = hasPermission('admin.roles');
  const [availableRoles, setAvailableRoles] = useState<{ name: string }[]>([]);

  useEffect(() => {
    if (!canManageRoles) return;
    api.get('/admin/roles')
      .then(({ data }) => setAvailableRoles(data))
      .catch((err) => console.warn('[PreferencesSection] roles fetch failed', err));
  }, [canManageRoles]);

  return (
    <div className="space-y-6">
      {import.meta.env.DEV && (
        <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] p-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
              <Globe className="w-5 h-5 text-ndp-text-dim" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-ndp-text">
                {t('account.preferences.language.title', 'Langue (dev)')}
              </h3>
              <p className="text-xs text-ndp-text-dim mt-1">
                {t('account.preferences.language.help', 'En production, la langue suit le réglage instance.')}
              </p>
            </div>
            <select
              value={i18n.language.split('-')[0]}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 cursor-pointer flex-shrink-0"
            >
              {Object.keys(i18n.options.resources || {}).map((code) => (
                <option key={code} value={code}>
                  {new Intl.DisplayNames([code], { type: 'language' }).of(code)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {canManageRoles && (
        <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] p-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
              {viewAsRole
                ? <EyeOff className="w-5 h-5 text-sky-400" />
                : <Eye className="w-5 h-5 text-sky-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-ndp-text">
                {t('account.preferences.view_as.title', 'Voir comme rôle')}
              </h3>
              <p className="text-xs text-ndp-text-dim mt-1">
                {t('account.preferences.view_as.help', "Prévisualisez l'app avec les permissions d'un autre rôle.")}
              </p>
            </div>
            <select
              value={viewAsRole || ''}
              onChange={(e) => onViewAsRoleChange(e.target.value || null)}
              className="bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 cursor-pointer flex-shrink-0"
            >
              <option value="">{t('admin.view_as.off', 'View as role...')}</option>
              {availableRoles.filter((r) => r.name !== 'admin').map((r) => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
