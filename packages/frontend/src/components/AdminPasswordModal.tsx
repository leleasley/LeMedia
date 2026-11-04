import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Loader2, X } from 'lucide-react';
import { useModal } from '@/hooks/useModal';

interface AdminPasswordModalProps {
  open: boolean;
  title: string;
  description?: string;
  /** Returns true to close the modal, false to keep it open (e.g. wrong password kept inline). */
  onSubmit: (password: string) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Reusable confirmation modal that asks the admin to re-enter their password before performing
 * a sensitive action (revealing a stored credential, copying it to the clipboard, etc.). Replaces
 * the legacy `globalThis.prompt()` flow which leaked the password as a browser dialog and offered
 * no a11y / styling control.
 */
export function AdminPasswordModal({ open, title, description, onSubmit, onClose }: AdminPasswordModalProps) {
  const { t } = useTranslation();
  const { dialogRef, titleId } = useModal({ open, onClose });
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setPassword('');
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await onSubmit(password);
      if (ok) {
        reset();
        onClose();
      } else {
        setError(t('common.admin_password_modal.invalid'));
        setPassword('');
        setSubmitting(false);
      }
    } catch {
      setError(t('common.admin_password_modal.invalid'));
      setPassword('');
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="modal-overlay z-[60]"
      onMouseDown={handleClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel relative p-6 w-full max-w-sm"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-ndp-accent/15 text-ndp-accent flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ndp-text">{title}</h2>
            {description && (
              <p className="text-xs text-ndp-text-muted mt-1">{description}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('common.admin_password_modal.placeholder')}
            autoComplete="current-password"
            className="input w-full !py-2 !text-sm"
            required
          />

          {error && (
            <p className="text-xs text-ndp-danger">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary !py-1.5 !px-3 !text-sm"
              disabled={submitting}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !password}
              className="btn-primary !py-1.5 !px-3 !text-sm inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('common.admin_password_modal.confirm')}
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={handleClose}
          aria-label={t('common.close')}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
