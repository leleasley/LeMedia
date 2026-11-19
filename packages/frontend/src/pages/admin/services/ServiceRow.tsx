import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { AlertTriangle, Loader2, Pencil, Plug, Power, Star, Trash2 } from 'lucide-react';
import type { ServiceData, ServiceSchema } from '@/hooks/useServiceSchemas';
import type { ServiceTestResult } from './useServicesTab';

interface ServiceRowProps {
  service: ServiceData;
  schema: ServiceSchema | undefined;
  testing: boolean;
  result: ServiceTestResult | null;
  /** Set when the security endpoint flagged this row — drives the inline warning icon.
   *  "plaintext" = pending encryption upgrade; "undecryptable" = imported from another env,
   *  credentials must be re-entered for the service to work. */
  flagReason?: 'plaintext' | 'undecryptable' | null;
  onTest: (service: ServiceData) => void;
  onEdit: (service: ServiceData) => void;
  onToggle: (service: ServiceData) => void;
  onSetDefault: (service: ServiceData) => void;
  onDelete: (id: number) => void;
}

/** One row in the services list — status dot, icon, name + URL, test badge, action buttons. */
export function ServiceRow({
  service, schema, testing, result, flagReason, onTest, onEdit, onToggle, onSetDefault, onDelete,
}: ServiceRowProps) {
  const { t } = useTranslation();

  const iconBtn = 'w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-dim hover:bg-white/[0.06] transition-colors disabled:opacity-50';

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className={clsx('flex items-center gap-3 flex-1 min-w-0', !service.enabled && 'opacity-50')}>
        <div className="relative flex-shrink-0">
          <span className="admin-icon-tile w-9 h-9 p-1.5">
            <img src={schema?.icon || '/logo-v2.png'} alt={schema?.label || service.type} className="w-full h-full object-contain" />
          </span>
          <span className={clsx('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-ndp-surface', service.enabled ? 'bg-ndp-success' : 'bg-ndp-text-dim')} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-ndp-text truncate">{service.name}</span>
            {service.isDefault && (
              <span className="admin-chip bg-ndp-accent/15 text-ndp-accent flex-shrink-0">{t('common.default_badge')}</span>
            )}
            {service.type === 'dmm' && service.config?.routeRequests === 'true' && (
              <span className="admin-chip bg-emerald-500/15 text-emerald-300 flex-shrink-0">{t('admin.services.dmm_taking_requests', 'Taking requests')}</span>
            )}
            {flagReason && (
              <span
                className={clsx(
                  'flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0',
                  flagReason === 'undecryptable'
                    ? 'bg-ndp-danger/15 text-ndp-danger'
                    : 'bg-amber-500/15 text-amber-400',
                )}
                title={t(
                  flagReason === 'undecryptable'
                    ? 'admin.services.flag.undecryptable'
                    : 'admin.services.flag.plaintext',
                )}
              >
                <AlertTriangle className="w-3 h-3" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0 text-xs text-ndp-text-dim">
            <span className="flex-shrink-0">{schema?.label || service.type}</span>
            {service.config.url && (
              <>
                <span aria-hidden className="flex-shrink-0">·</span>
                <span className="truncate">{service.config.url}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pl-12 sm:pl-0 sm:justify-end flex-shrink-0">
        <div className="min-w-0">
          {result && (() => {
            const blocked = !result.ok && result.errorCode === 'URL_BLOCKED_BY_SSRF_GUARD';
            // Hovering the badge shows the full pre-rendered cause (e.g. "Connection refused at
            // 192.168.1.50:7878 — nothing listening, or bound to localhost"). Keeps the row tight
            // while still giving admins enough to diagnose without opening AppLog.
            const title = blocked
              ? t('admin.services.ssrf_blocked')
              : !result.ok
              ? result.errorDetail
              : undefined;
            return (
              <span
                className={clsx(
                  'admin-chip',
                  result.ok
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : blocked
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-red-500/15 text-red-300',
                )}
                title={title}
              >
                {result.ok
                  ? (result.version ? `v${result.version}` : t('status.connected'))
                  : blocked
                  ? t('status.ssrf_blocked')
                  : t('status.connection_failed')}
              </span>
            );
          })()}
        </div>

        <div className="flex items-center -mr-2 flex-shrink-0">
          <button onClick={() => onTest(service)} disabled={testing} className={clsx(iconBtn, 'hover:text-ndp-accent')} title={t('common.test')} aria-label={t('common.test')}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
          </button>
          <button onClick={() => onEdit(service)} className={clsx(iconBtn, 'hover:text-ndp-text')} title={t('common.edit')} aria-label={t('common.edit')}>
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => onToggle(service)} className={clsx(iconBtn, 'hover:text-ndp-text')} title={service.enabled ? t('common.disable') : t('common.enable')} aria-label={service.enabled ? t('common.disable') : t('common.enable')}>
            <Power className={clsx('w-4 h-4', service.enabled && 'text-ndp-success')} />
          </button>
          {!service.isDefault && (
            <button onClick={() => onSetDefault(service)} className={clsx(iconBtn, 'hover:text-ndp-warning')} title={t('admin.services.set_default')} aria-label={t('admin.services.set_default')}>
              <Star className="w-4 h-4" />
            </button>
          )}
          <div className="w-px h-5 bg-white/[0.08] mx-1" />
          <button onClick={() => onDelete(service.id)} className={clsx(iconBtn, 'hover:text-ndp-danger hover:bg-ndp-danger/10')} title={t('common.delete')} aria-label={t('common.delete')}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
