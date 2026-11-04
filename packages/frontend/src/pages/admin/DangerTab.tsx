import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation, Trans } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, CheckCircle, AlertTriangle, ChevronDown } from 'lucide-react';
import api from '@/lib/api';
import { AdminTabLayout } from './AdminTabLayout';
import { extractApiError } from '@/utils/toast';
import { useModal } from '@/hooks/useModal';

/**
 * Destructive bulk operations (purge requests / media / users) — lives as a final stop inside
 * the System group. Each action requires typing a confirmation keyword to guard against slips.
 */
export function DangerTab() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; label: string; desc: string; keyword: string; onConfirm: () => Promise<void> } | null>(null);
  const confirmModal = useModal({
    open: confirmAction !== null,
    onClose: () => { if (!executing) setConfirmAction(null); },
  });
  const [confirmInput, setConfirmInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const actions = [
    {
      id: 'requests',
      label: t('admin.danger.purge_requests'),
      desc: t('admin.danger.purge_requests_desc'),
      keyword: t('admin.danger.keyword'),
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/requests');
        setResult(t('admin.danger.deleted_requests', { count: data.deleted }));
      },
    },
    {
      id: 'media',
      label: t('admin.danger.purge_media'),
      desc: t('admin.danger.purge_media_desc'),
      keyword: t('admin.danger.keyword'),
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/media');
        setResult(t('admin.danger.deleted_media', { media: data.deleted.media, seasons: data.deleted.seasons, requests: data.deleted.requests }));
      },
    },
    {
      id: 'users',
      label: t('admin.danger.purge_users'),
      desc: t('admin.danger.purge_users_desc'),
      keyword: t('admin.danger.keyword'),
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/users');
        setResult(t('admin.danger.deleted_users', { count: data.deleted }));
      },
    },
  ];

  const handleExecute = async () => {
    if (!confirmAction || confirmInput !== confirmAction.keyword) return;
    setExecuting(true);
    setExecuteError(null);
    try {
      await confirmAction.onConfirm();
      setConfirmAction(null);
      setConfirmInput('');
    } catch (err) {
      console.error('DangerTab purge failed', err);
      setExecuteError(extractApiError(err, t('admin.danger.purge_failed', 'Purge failed, the operation did not complete.')));
    } finally { setExecuting(false); }
  };

  return (
    <AdminTabLayout>
      <div>
        <div className="rounded-xl bg-ndp-danger/[0.04] ring-1 ring-inset ring-ndp-danger/25 overflow-hidden">
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] text-left hover:bg-ndp-danger/[0.06] transition-colors"
          >
            <span className="admin-icon-tile bg-ndp-danger/15 text-ndp-danger">
              <AlertTriangle className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-ndp-danger">{t('admin.danger.title')}</h3>
              <p className="text-xs text-ndp-text-dim mt-0.5 leading-relaxed">{t('admin.danger.description')}</p>
            </div>
            <ChevronDown className={clsx('w-4 h-4 text-ndp-danger/80 flex-shrink-0 transition-transform duration-200', expanded && 'rotate-180')} />
          </button>

          <div className={clsx('overflow-hidden transition-all duration-200', expanded ? 'max-h-[1000px]' : 'max-h-0')}>
            {result && (
              <div className="px-4 py-3 bg-ndp-success/[0.06] border-t border-ndp-danger/15 animate-fade-in">
                <p className="text-sm text-ndp-success flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">{result}</span>
                </p>
              </div>
            )}

            <div className="divide-y divide-ndp-danger/10 border-t border-ndp-danger/15">
              {actions.map((action) => (
                <div key={action.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ndp-text">{action.label}</p>
                    <p className="text-xs text-ndp-text-dim mt-0.5 leading-relaxed">{action.desc}</p>
                  </div>
                  <button
                    onClick={() => { setConfirmAction(action); setConfirmInput(''); setResult(null); setExecuteError(null); }}
                    className="btn-danger text-sm px-4 py-2.5 w-full sm:w-auto flex-shrink-0"
                  >
                    {action.label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {confirmAction && createPortal(
          <div className="modal-overlay z-50" onClick={() => !executing && setConfirmAction(null)}>
            <div
              ref={confirmModal.dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={confirmModal.titleId}
              className="modal-panel px-5 pt-6 pb-5 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <span className="admin-icon-tile bg-ndp-danger/15 text-ndp-danger">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <h3 id={confirmModal.titleId} className="text-base font-semibold text-ndp-text">
                  {t('admin.danger.confirm_title')}
                </h3>
              </div>
              <p className="text-sm text-ndp-text-muted mt-4 leading-relaxed">{confirmAction.desc}</p>
              <p className="text-sm text-ndp-text-muted mt-4">
                <Trans
                  i18nKey="admin.danger.confirm_text"
                  values={{ keyword: confirmAction.keyword }}
                  components={{ strong: <strong className="font-semibold text-ndp-text" /> }}
                />
              </p>
              <input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={confirmAction.keyword}
                className="input w-full mt-2.5 text-sm font-mono"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
              />
              {executeError && (
                <div className="mt-3 p-3 rounded-lg bg-ndp-danger/10 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-ndp-danger flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-ndp-danger break-words min-w-0">{executeError}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setConfirmAction(null)} disabled={executing} className="btn-secondary text-sm">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleExecute}
                  disabled={confirmInput !== confirmAction.keyword || executing}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-ndp-danger rounded-lg hover:bg-ndp-danger/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {executing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmAction.label}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>
    </AdminTabLayout>
  );
}
