import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Server, Trash2 } from 'lucide-react';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { useServiceSchemas, type ServiceData } from '@/hooks/useServiceSchemas';
import { useServicesTab } from './services/useServicesTab';
import { ServiceRow } from './services/ServiceRow';
import { ServiceModal } from './services/ServiceModal';
import api from '@/lib/api';
import { SERVICE_SAVED_EVENT } from './EncryptionUpgradeBanner';

type FlagReason = 'plaintext' | 'undecryptable';

/**
 * Admin → Services. Lists every configured *arr / media server / downloader, with per-row test
 * badges, quick toggles, and a modal for create/edit. Data + mutations live in `useServicesTab`;
 * the row and the form are their own components. This file just composes the layout.
 */
export function ServicesTab() {
  const { schemas: SERVICE_SCHEMAS } = useServiceSchemas();
  const { t } = useTranslation();
  const {
    services, loading, testing, testResults, deleting,
    fetchServices, deleteService, toggleService, setDefaultService, testService,
  } = useServicesTab();

  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<ServiceData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [flags, setFlags] = useState<Map<number, FlagReason>>(new Map());

  // Pull the security-flag map (plaintext / undecryptable per service) so each row can
  // show an inline warning. Same data source as the global banner; we listen for the
  // `lemedia:service-saved` event so it refreshes the second a row is re-saved.
  const refreshFlags = useCallback(async () => {
    try {
      const { data } = await api.get<{ services: Array<{ id: number; reason: FlagReason }> }>(
        '/admin/security/services-needing-reencryption',
      );
      const next = new Map<number, FlagReason>();
      for (const s of data.services ?? []) next.set(s.id, s.reason);
      setFlags(next);
    } catch {
      setFlags(new Map());
    }
  }, []);

  useEffect(() => {
    void refreshFlags();
    const onSaved = () => { void refreshFlags(); };
    window.addEventListener(SERVICE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(SERVICE_SAVED_EVENT, onSaved);
  }, [refreshFlags]);

  const handleDeleteConfirmed = async (id: number) => {
    // Only close the confirm modal on success — on error the toast explains what happened and
    // the admin can retry with the same selection still in view.
    if (await deleteService(id)) setConfirmDelete(null);
  };

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout
      title={t('admin.tab.services')}
      count={services.length}
      actions={
        <button onClick={() => { setEditingService(null); setShowModal(true); }} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2 min-h-[40px]">
          <Plus className="w-4 h-4" /> {t('common.add')}
        </button>
      }
    >
      {services.length === 0 ? (
        <div className="admin-group px-6 py-10 text-center">
          <div className="admin-icon-tile w-10 h-10 mx-auto mb-3 text-ndp-text-dim">
            <Server className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-ndp-text">{t('admin.services.no_services')}</p>
          <p className="text-xs text-ndp-text-dim mt-1">{t('admin.services.no_services_help')}</p>
        </div>
      ) : (
        <div className="admin-group divide-y divide-white/[0.06]">
          {services.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              schema={SERVICE_SCHEMAS[service.type]}
              testing={testing === service.id}
              result={testResults[service.id] || null}
              flagReason={flags.get(service.id) ?? null}
              onTest={testService}
              onEdit={(s) => { setEditingService(s); setShowModal(true); }}
              onToggle={toggleService}
              onSetDefault={setDefaultService}
              onDelete={setConfirmDelete}
            />
          ))}
        </div>
      )}

      {confirmDelete !== null && createPortal(
        <div className="modal-overlay z-50">
          <div className="modal-panel px-5 pt-6 pb-5 sm:p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-ndp-text mb-1.5">{t('admin.danger.confirm_title')}</h3>
            <p className="text-sm text-ndp-text-muted mb-6">
              {t('admin.services.confirm_delete', { name: services.find((s) => s.id === confirmDelete)?.name })}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary text-sm px-4 py-2">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleDeleteConfirmed(confirmDelete)}
                disabled={deleting}
                className="btn-danger text-sm px-4 py-2 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showModal && (
        <ServiceModal
          service={editingService}
          onClose={() => { setShowModal(false); setEditingService(null); }}
          onSaved={() => { setShowModal(false); setEditingService(null); fetchServices(); }}
        />
      )}
    </AdminTabLayout>
  );
}
