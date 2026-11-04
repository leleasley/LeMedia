import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useModal } from '@/hooks/useModal';

interface Props {
  onConfirm: () => void;
  onClose: () => void;
}

export function ResetDashboardConfirmModal({ onConfirm, onClose }: Readonly<Props>) {
  const { t } = useTranslation();
  const { dialogRef, titleId } = useModal({ open: true, onClose });

  return (
    <div
      className="modal-overlay z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel w-full max-w-md"
      >
        <div className="flex items-center justify-between gap-4 pl-5 pr-3 sm:pl-6 pt-4 pb-1 sm:pt-5">
          <h2 id={titleId} className="text-base font-semibold text-ndp-text">{t('admin.dashboard.reset.title')}</h2>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <p className="text-sm text-ndp-text-muted leading-relaxed">
            {t('admin.dashboard.reset.body')}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="btn-secondary text-sm px-4 py-2"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className="inline-flex items-center justify-center rounded-lg bg-ndp-danger px-4 py-2 text-sm font-medium text-white hover:bg-ndp-danger/85 transition-colors"
            >
              {t('admin.dashboard.reset.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
