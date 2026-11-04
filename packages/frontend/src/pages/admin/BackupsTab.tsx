import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, CheckCircle, AlertTriangle, Trash2, Download, Upload, Archive, X } from 'lucide-react';
import api from '@/lib/api';
import { showToast } from '@/utils/toast';
import { AdminTabLayout } from './AdminTabLayout';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useModal } from '@/hooks/useModal';
import { SwitchTrack } from '@/components/ui/Switch';

const displayBackupName = (filename: string) => filename;

/**
 * Download / upload an LeMedia archive — lives in the System group. Handles the full create +
 * restore flow, including manifest validation against the current build before applying any DB.
 */
export function BackupsTab() {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [restoreModal, setRestoreModal] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreManifest, setRestoreManifest] = useState<{ version: string; createdAt: string; stats: Record<string, number> } | null>(null);
  const [restoreValidation, setRestoreValidation] = useState<{ compatible: boolean; needsMigration: boolean; error?: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const [restoreNeedsRestart, setRestoreNeedsRestart] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [includeCache, setIncludeCache] = useState(false);
  const [savedBackups, setSavedBackups] = useState<{ filename: string; size: number; createdAt: string }[]>([]);
  const [restorePassword, setRestorePassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreModalA11y = useModal({ open: restoreModal, onClose: () => setRestoreModal(false) });

  useEffect(() => {
    api.get('/admin/backup/list')
      .then(({ data }) => setSavedBackups(data))
      .catch((err) => {
        console.error('BackupsTab list load failed', err);
        showToast(t('admin.backup.list_failed'), 'error');
      });
  }, [t]);

  const handleBackup = async () => {
    setDownloading(true);
    try {
      const { data } = await api.get(`/admin/backup/create?includeCache=${includeCache}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lemedia-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('BackupsTab create failed', err);
      showToast(t('admin.backup.create_failed'), 'error');
    } finally { setDownloading(false); }
  };

  const handleFileSelect = async (file: File) => {
    setRestoreFile(file);
    setRestoreManifest(null);
    setRestoreValidation(null);
    setRestoreError(null);
    setRestoreResult(null);

    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) { setRestoreError(t('admin.backup.invalid_archive')); return; }

      const manifest = JSON.parse(await manifestFile.async('text'));
      setRestoreManifest(manifest);

      const { data } = await api.post('/admin/backup/validate', { manifest });
      setRestoreValidation(data);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg === 'BACKUP_TOO_NEW') setRestoreError(t('admin.backup.too_new'));
      else setRestoreError(msg || t('admin.backup.validation_failed'));
    }
  };

  const handleRestore = async () => {
    if (!restoreFile || !restoreManifest) return;
    setRestoring(true);
    setRestoreError(null);

    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(restoreFile);
      const dbFile = zip.file('lemedia.db');
      if (!dbFile) { setRestoreError(t('admin.backup.no_db')); setRestoring(false); return; }

      const dbBase64 = await dbFile.async('base64');

      // Plugin-owned data (KV files, per-plugin SQLite) travels in the archive under `plugins/`.
      // The backend re-checks every path.
      const pluginFiles = zip.file(/^plugins\//);
      const plugins = await Promise.all(
        pluginFiles
          .filter((entry) => !entry.dir)
          .map(async (entry) => ({ path: entry.name, data: await entry.async('base64') })),
      );

      const { data } = await api.post('/admin/backup/restore', {
        db: dbBase64,
        manifest: restoreManifest,
        password: restorePassword,
        plugins,
      });

      setRestoreResult(data.message);
      setRestoreNeedsRestart(!!data.needsRestart);
      setRestorePassword('');
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const mapped = (() => {
        switch (code) {
          case 'PASSWORD_REQUIRED': return t('admin.backup.password_required');
          case 'INVALID_PASSWORD': return t('admin.backup.invalid_password');
          case 'BACKUP_SIGNATURE_INVALID': return t('admin.backup.signature_invalid');
          case 'BACKUP_UNSIGNED': return t('admin.backup.unsigned');
          case 'ADMIN_HAS_NO_PASSWORD': return t('admin.backup.admin_no_password');
          default: return code || t('admin.backup.restore_failed');
        }
      })();
      setRestoreError(mapped);
    } finally { setRestoring(false); }
  };

  return (
    <AdminTabLayout>
      <div className="space-y-8">
        <section>
          <h3 className="admin-group-label">{t('admin.backup.title')}</h3>
          <div className="admin-group divide-y divide-white/[0.06]">
            <button
              onClick={handleBackup}
              disabled={downloading}
              className="admin-row w-full text-left hover:bg-white/[0.03] transition-colors disabled:cursor-wait"
            >
              <span className="admin-icon-tile bg-ndp-accent/15 text-ndp-accent">
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ndp-text">{t('admin.backup.create')}</p>
                <p className="text-xs text-ndp-text-dim mt-0.5">{t('admin.backup.create_desc')}</p>
              </div>
            </button>

            <button
              onClick={() => { setRestoreModal(true); setRestoreFile(null); setRestoreManifest(null); setRestoreValidation(null); setRestoreError(null); setRestoreResult(null); }}
              className="admin-row w-full text-left hover:bg-white/[0.03] transition-colors"
            >
              <span className="admin-icon-tile">
                <Upload className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ndp-text">{t('admin.backup.restore')}</p>
                <p className="text-xs text-ndp-text-dim mt-0.5">{t('admin.backup.restore_desc')}</p>
              </div>
            </button>

            {/* Include-cache option, same button, rendered as a switch on the right. */}
            <button
              onClick={() => setIncludeCache(!includeCache)}
              role="switch"
              aria-checked={includeCache}
              className="admin-row w-full text-left hover:bg-white/[0.03] transition-colors"
            >
              <span className="flex-1 min-w-0 text-sm text-ndp-text">{t('admin.backup.include_cache')}</span>
              <SwitchTrack on={includeCache} />
            </button>
          </div>
        </section>

        {savedBackups.length > 0 && (
          <section>
            <h4 className="admin-group-label">{t('admin.backup.saved_backups')}</h4>
            <div className="admin-group divide-y divide-white/[0.06]">
              {savedBackups.map(b => (
                <div key={b.filename} className="admin-row">
                  <span className="admin-icon-tile">
                    <Archive className="w-4 h-4 text-ndp-text-muted" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ndp-text break-all leading-snug">{displayBackupName(b.filename)}</p>
                    <p className="text-[11px] text-ndp-text-dim mt-0.5">{new Date(b.createdAt).toLocaleString()} · {(b.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <div className="flex items-center flex-shrink-0">
                    <button
                      onClick={async () => {
                        try {
                          const { data } = await api.get(`/admin/backup/download/${b.filename}`, { responseType: 'blob' });
                          const url = URL.createObjectURL(data);
                          const a = document.createElement('a');
                          a.href = url; a.download = displayBackupName(b.filename); a.click();
                          URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error('BackupsTab download failed', err);
                          showToast(t('admin.backup.download_failed'), 'error');
                        }
                      }}
                      aria-label="Download"
                      title="Download"
                      className="w-10 h-10 flex items-center justify-center text-ndp-text-muted hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(b.filename)}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                      className="w-10 h-10 flex items-center justify-center text-ndp-text-muted hover:text-ndp-danger hover:bg-ndp-danger/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <ConfirmModal
          open={deleteTarget !== null}
          tone="danger"
          title={t('admin.backup.delete_title', 'Delete this backup?')}
          description={deleteTarget ? displayBackupName(deleteTarget) : undefined}
          confirmLabel={t('common.delete')}
          onConfirm={async () => {
            if (!deleteTarget) return;
            try {
              await api.delete(`/admin/backup/${deleteTarget}`);
              setSavedBackups(prev => prev.filter(x => x.filename !== deleteTarget));
            } catch (err) {
              console.error('BackupsTab delete failed', err);
              showToast(t('admin.backup.delete_failed'), 'error');
            }
          }}
          onClose={() => setDeleteTarget(null)}
        />

        {restoreModal && createPortal(
          <div className="modal-overlay z-50" onClick={() => setRestoreModal(false)}>
            <div
              ref={restoreModalA11y.dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={restoreModalA11y.titleId}
              className="modal-panel px-5 pt-6 pb-5 sm:p-6 max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="admin-icon-tile">
                    <Archive className="w-4 h-4" />
                  </span>
                  <h3 id={restoreModalA11y.titleId} className="text-base font-semibold text-ndp-text truncate">{t('admin.backup.restore')}</h3>
                </div>
                <button onClick={() => setRestoreModal(false)} aria-label={t('common.close')} className="w-10 h-10 -mr-2 flex items-center justify-center rounded-lg hover:bg-white/5 text-ndp-text-dim hover:text-ndp-text transition-colors flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!restoreResult && !restoreFile && !restoreError && (
                <div
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
                  role="button"
                  tabIndex={0}
                  className="border border-dashed border-white/15 rounded-xl px-6 py-10 text-center hover:border-ndp-accent/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <Upload className="w-7 h-7 text-ndp-text-dim mx-auto mb-3" />
                  <p className="text-sm text-ndp-text-muted">{t('admin.backup.drop_file')}</p>
                  <p className="text-xs text-ndp-text-dim mt-1 font-mono">.zip</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  />
                </div>
              )}

              {!restoreResult && restoreManifest && restoreValidation && !restoreError && (
                <div className="space-y-4">
                  <div className="admin-group divide-y divide-white/[0.06] bg-white/[0.02]">
                    <div className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                      <span className="text-ndp-text-dim">{t('admin.backup.version')}</span>
                      <span className="text-ndp-text font-medium text-right">{restoreManifest.version}</span>
                    </div>
                    <div className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                      <span className="text-ndp-text-dim">{t('admin.backup.date')}</span>
                      <span className="text-ndp-text font-medium text-right">{new Date(restoreManifest.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                      <span className="text-ndp-text-dim flex-shrink-0">{t('admin.backup.stats')}</span>
                      <span className="text-ndp-text font-medium text-right">
                        {t('admin.backup.stats_detail', { users: restoreManifest.stats.users, media: restoreManifest.stats.media, requests: restoreManifest.stats.requests })}
                      </span>
                    </div>
                    {restoreValidation.needsMigration && (
                      <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-ndp-warning">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        {t('admin.backup.needs_migration')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-2 p-3 rounded-lg bg-ndp-warning/10 text-ndp-warning text-xs leading-relaxed">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{t('admin.backup.restore_warning')}</span>
                  </div>

                  <div>
                    <label htmlFor="restore-password" className="text-sm font-medium text-ndp-text mb-1.5 block">
                      {t('admin.backup.confirm_password')}
                    </label>
                    <input
                      id="restore-password"
                      type="password"
                      value={restorePassword}
                      onChange={(e) => setRestorePassword(e.target.value)}
                      placeholder={t('admin.backup.confirm_password_placeholder')}
                      className="input w-full"
                      autoComplete="current-password"
                    />
                    <p className="text-xs text-ndp-text-dim mt-1.5">
                      {t('admin.backup.confirm_password_help')}
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => { setRestoreFile(null); setRestoreManifest(null); setRestoreValidation(null); setRestorePassword(''); }} className="btn-secondary text-sm">
                      {t('common.cancel')}
                    </button>
                    <button onClick={handleRestore} disabled={restoring || !restorePassword} className="btn-danger text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {t('admin.backup.confirm_restore')}
                    </button>
                  </div>
                </div>
              )}

              {restoreResult && (
                <div className="space-y-4">
                  <div className="px-5 py-6 rounded-xl bg-ndp-success/10 text-center">
                    <CheckCircle className="w-7 h-7 text-ndp-success mx-auto mb-3" />
                    <p className="text-base text-ndp-success font-semibold">{t('admin.backup.restore_success')}</p>
                    <p className="text-sm text-ndp-text-muted mt-2">{t(restoreNeedsRestart ? 'admin.backup.restart_required' : 'admin.backup.reload_hint')}</p>
                  </div>
                  <button onClick={() => setRestoreModal(false)} className="btn-primary w-full text-sm">
                    {t('common.close')}
                  </button>
                </div>
              )}

              {restoreError && (
                <div className="space-y-4">
                  <div className="px-5 py-5 rounded-xl bg-ndp-danger/10 text-center">
                    <AlertTriangle className="w-6 h-6 text-ndp-danger mx-auto mb-2" />
                    <p className="text-sm text-ndp-danger font-medium break-words">{restoreError}</p>
                  </div>
                  <button onClick={() => { setRestoreError(null); setRestoreFile(null); setRestoreManifest(null); setRestoreValidation(null); }} className="btn-secondary w-full text-sm">
                    {t('admin.backup.try_again')}
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </AdminTabLayout>
  );
}
