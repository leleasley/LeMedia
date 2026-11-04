import { useState, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Plus, X, Check, Trash2, Shield, Link2, CheckCircle, Clock } from 'lucide-react';
import api from '@/lib/api';
import { toastApiError, showToast } from '@/utils/toast';
import { useModal } from '@/hooks/useModal';

interface QualityMappingType {
  id: number;
  qualityProfileId: number;
  qualityProfileName: string;
  service: { id: number; name: string; type: string };
}

interface QualityOptionType {
  id: number;
  label: string;
  position: number;
  allowedRoles: string | null;
  approvalMode: string | null;
  mappings: QualityMappingType[];
}

interface ServiceType {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

interface RoleType {
  id: number;
  name: string;
}

export function QualityTab() {
  const { t } = useTranslation();
  const groupId = useId();
  const [options, setOptions] = useState<QualityOptionType[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [roles, setRoles] = useState<RoleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOption, setEditingOption] = useState<number | null>(null);
  const { dialogRef: optionDialogRef, titleId: optionTitleId } = useModal({
    open: editingOption !== null,
    onClose: () => setEditingOption(null),
  });
  const [editingMapping, setEditingMapping] = useState<{ qualityOptionId: number; serviceId: number } | null>(null);
  const { dialogRef: mappingDialogRef, titleId: mappingTitleId } = useModal({
    open: editingMapping !== null,
    onClose: () => setEditingMapping(null),
  });
  const [profiles, setProfiles] = useState<{ id: number; name: string }[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<number>>(new Set());
  const [savingMapping, setSavingMapping] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [fetchingProfiles, setFetchingProfiles] = useState(false);

  const load = useCallback(async () => {
    try {
      const [optRes, svcRes, roleRes] = await Promise.all([
        api.get('/admin/quality-options'),
        api.get('/admin/services'),
        api.get('/admin/roles'),
      ]);
      setOptions(optRes.data);
      setServices(svcRes.data.filter((s: ServiceType) => ['radarr', 'sonarr'].includes(s.type) && s.enabled));
      setRoles(roleRes.data.filter((r: RoleType) => r.name !== 'admin'));
    } catch (err) { toastApiError(err, t('admin.quality.load_failed')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const addOption = async () => {
    if (!newLabel.trim()) return;
    try {
      await api.post('/admin/quality-options', { label: newLabel.trim() });
      setNewLabel('');
      setAdding(false);
      showToast(t('admin.quality.add_option_success', 'Quality option added'), 'success');
      load();
    } catch (err) { toastApiError(err, t('admin.quality.add_option_failed')); }
  };

  const deleteOption = async (id: number) => {
    try {
      await api.delete(`/admin/quality-options/${id}`);
      showToast(t('admin.quality.delete_option_success', 'Quality option deleted'), 'success');
      load();
    } catch (err) { toastApiError(err, t('admin.quality.delete_option_failed')); }
  };

  const updateAllowedRoles = async (optionId: number, roleName: string, add: boolean) => {
    const opt = options.find(o => o.id === optionId);
    if (!opt) return;
    const current: string[] = opt.allowedRoles ? JSON.parse(opt.allowedRoles) : [];
    const next = add ? [...current, roleName] : current.filter(r => r !== roleName);
    try {
      await api.put(`/admin/quality-options/${optionId}`, { allowedRoles: next });
      load();
    } catch (err) { toastApiError(err, t('admin.quality.update_roles_failed')); }
  };

  const updateApprovalMode = async (optionId: number, mode: string | null) => {
    try {
      await api.put(`/admin/quality-options/${optionId}`, { approvalMode: mode });
      load();
    } catch (err) { toastApiError(err, t('admin.quality.update_approval_failed')); }
  };

  const openMapping = async (qualityOptionId: number, serviceId: number) => {
    setEditingMapping({ qualityOptionId, serviceId });
    setProfiles([]);
    setSelectedProfiles(new Set());
    setLoadingProfiles(true);
    try {
      const { data } = await api.get(`/admin/services/${serviceId}/profiles`);
      const opt = options.find(o => o.id === qualityOptionId);
      const existingProfileIds = new Set(
        opt?.mappings.filter(m => m.service.id === serviceId).map(m => m.qualityProfileId) || []
      );
      setProfiles(data.filter((p: { id: number }) => !existingProfileIds.has(p.id)));
    } catch (err) { toastApiError(err, t('admin.quality.profiles_fetch_failed')); }
    finally { setLoadingProfiles(false); }
  };

  const saveMappings = async () => {
    if (!editingMapping || selectedProfiles.size === 0) return;
    setSavingMapping(true);
    try {
      for (const profileId of selectedProfiles) {
        const profile = profiles.find(p => p.id === profileId);
        await api.post('/admin/quality-mappings', {
          qualityOptionId: editingMapping.qualityOptionId,
          serviceId: editingMapping.serviceId,
          qualityProfileId: profileId,
          qualityProfileName: profile?.name || `Profile ${profileId}`,
        });
      }
      showToast(t('admin.quality.save_mappings_success', 'Mappings saved'), 'success');
      setEditingMapping(null);
      load();
    } catch (err) { toastApiError(err, t('admin.quality.save_mappings_failed')); }
    finally { setSavingMapping(false); }
  };

  const deleteMapping = async (mappingId: number) => {
    try {
      await api.delete(`/admin/quality-mappings/${mappingId}`);
      showToast(t('admin.quality.delete_mapping_success', 'Mapping removed'), 'success');
      load();
    } catch (err) { toastApiError(err, t('admin.quality.delete_mapping_failed')); }
  };

  const seedDefaults = async () => {
    try {
      await api.post('/admin/quality-options/seed');
      load();
    } catch (err) { toastApiError(err, t('admin.quality.seed_failed')); }
  };

  const fetchAllProfiles = async () => {
    if (services.length === 0) {
      toastApiError(new Error('No Radarr/Sonarr services configured'), t('admin.quality.no_services'));
      return;
    }
    // If no quality tiers exist yet, seed the defaults first so the list isn't empty after fetch
    if (options.length === 0) {
      try { await api.post('/admin/quality-options/seed'); } catch {}
      await load();
    }
    setFetchingProfiles(true);
    try {
      const results = await Promise.all(
        services.map(async (svc) => {
          try {
            const { data } = await api.get(`/admin/services/${svc.id}/profiles`);
            return { name: svc.name, count: Array.isArray(data) ? data.length : 0, ok: true };
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Unable to reach';
            return { name: svc.name, count: 0, ok: false, error: msg };
          }
        })
      );
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        const summary = ok.map((r) => `${r.name}: ${r.count} profiles`).join(' · ');
        // Use a success toast via the error helper with a synthetic message — the mappings editor itself proves integration.
        showToast(`Fetched profiles, ${summary}`, 'success');
      } else {
        showToast(`Some services failed: ${failed.map((r) => `${r.name} (${r.error})`).join(', ')}`, 'error');
        if (ok.length > 0) {
          showToast(`Fetched ${ok.map((r) => `${r.name}: ${r.count}`).join(' · ')}`, 'success');
        }
      }
    } finally {
      setFetchingProfiles(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-ndp-accent" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 min-h-[40px]">
        <h2 className="font-display-title text-3xl text-ndp-text">{t('admin.quality.options_title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {options.length === 0 && (
            <button onClick={seedDefaults} className="btn-secondary text-sm px-4 py-2 min-h-[40px]">{t('admin.quality.add_defaults')}</button>
          )}
          <button
            onClick={fetchAllProfiles}
            disabled={fetchingProfiles || services.length === 0}
            className="btn-secondary text-sm px-4 py-2 min-h-[40px] flex items-center gap-1.5 disabled:opacity-50"
            title={services.length === 0 ? t('admin.quality.no_services') : 'Fetch live profiles from each Radarr/Sonarr service'}
          >
            {fetchingProfiles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Fetch profiles
          </button>
          <button onClick={() => setAdding(true)} className="btn-primary text-sm px-4 py-2 min-h-[40px] flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> {t('common.add')}
          </button>
        </div>
      </div>

      {/* Quality cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {options.map((opt) => {
          const isSelected = editingOption === opt.id;
          const allowedRoles: string[] = opt.allowedRoles ? JSON.parse(opt.allowedRoles) : [];

          // Group mappings by service
          const byService = new Map<string, { name: string; profiles: string[] }>();
          for (const m of opt.mappings) {
            const key = String(m.service.id);
            if (!byService.has(key)) byService.set(key, { name: m.service.name, profiles: [] });
            byService.get(key)!.profiles.push(m.qualityProfileName);
          }

          return (
            <div
              key={opt.id}
              className={clsx(
                'card p-4 flex flex-col gap-3 min-w-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndp-accent/60',
                isSelected ? 'ring-1 ring-ndp-accent/40' : 'hover:bg-ndp-surface-light active:bg-ndp-surface-light',
              )}
              onClick={() => setEditingOption(isSelected ? null : opt.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingOption(isSelected ? null : opt.id); } }}
              role="button"
              tabIndex={0}
            >
              {/* Label */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-sm font-semibold text-ndp-text truncate">{opt.label}</span>
                {allowedRoles.length > 0 && (
                  <span className="admin-chip flex-shrink-0">
                    <Shield className="w-3 h-3" />
                    {allowedRoles.length}
                  </span>
                )}
              </div>

              {/* Mappings grouped by service */}
              <div className="flex flex-wrap gap-1.5">
                {[...byService.entries()].map(([key, svc]) => (
                  <span key={key} className="inline-flex items-start gap-1.5 max-w-full text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-300 font-medium">
                    <Link2 className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-60" />
                    <span className="min-w-0 break-words">
                      <span className="text-ndp-text-dim">{svc.name}:</span> {svc.profiles.join(', ')}
                    </span>
                  </span>
                ))}
                {opt.mappings.length === 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-ndp-text-dim">
                    <Link2 className="w-3 h-3" />
                    {t('admin.quality.no_mappings')}
                  </span>
                )}
              </div>

              {/* Roles + approval */}
              <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-white/[0.06]">
                {allowedRoles.length > 0 ? allowedRoles.map(r => (
                  <span key={r} className="admin-chip bg-ndp-accent/15 text-ndp-accent capitalize">
                    <Shield className="w-3 h-3" />
                    {r}
                  </span>
                )) : (
                  <span className="admin-chip">
                    <Shield className="w-3 h-3" />
                    {t('admin.quality.all_roles')}
                  </span>
                )}
                {opt.approvalMode === 'auto' && (
                  <span className="admin-chip bg-emerald-500/15 text-emerald-300">
                    <CheckCircle className="w-3 h-3" />
                    {t('admin.quality.approval_auto')}
                  </span>
                )}
                {opt.approvalMode === 'manual' && (
                  <span className="admin-chip bg-amber-500/15 text-amber-300">
                    <Clock className="w-3 h-3" />
                    {t('admin.quality.approval_manual')}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Add new card */}
        {adding && (
          <div className="card p-4 flex flex-col gap-3 ring-1 ring-ndp-accent/40">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addOption()}
              placeholder={t('admin.quality.new_placeholder')}
              className="input text-sm w-full"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => { setAdding(false); setNewLabel(''); }} className="btn-secondary text-sm px-3 py-2 min-h-[40px] flex-1">{t('common.cancel')}</button>
              <button onClick={addOption} disabled={!newLabel.trim()} className="btn-primary text-sm px-3 py-2 min-h-[40px] flex-1 disabled:opacity-50">{t('common.add')}</button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal, flat layout like RBAC modal */}
      {editingOption && (() => {
        const opt = options.find(o => o.id === editingOption);
        if (!opt) return null;
        const allowedRoles: string[] = opt.allowedRoles ? JSON.parse(opt.allowedRoles) : [];

        return createPortal(
          <div className="modal-overlay z-50">
            <div
              ref={optionDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={optionTitleId}
              className="modal-panel px-5 pt-6 pb-5 sm:p-6 max-w-lg w-full max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-5">
                <h3 id={optionTitleId} className="text-lg font-semibold text-ndp-text truncate">{opt.label}</h3>
                <div className="flex items-center -mr-2 flex-shrink-0">
                  <button onClick={() => { deleteOption(opt.id); setEditingOption(null); }} aria-label={t('common.delete')} className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingOption(null)} aria-label={t('common.close')} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-ndp-text-dim hover:text-ndp-text transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6">
                {/* Mappings, group of service → profile chips, no single input so labelled via aria */}
                <div role="group" aria-labelledby={`${groupId}-mappings`}>
                  <span id={`${groupId}-mappings`} className="admin-group-label block">{t('admin.quality.mapping_title')}</span>
                  <div className="flex flex-wrap gap-2">
                    {opt.mappings.map((m) => (
                      <span key={m.id} className="inline-flex items-center gap-1 max-w-full min-h-[36px] text-sm pl-3 pr-1 rounded-lg bg-emerald-500/10 text-emerald-300 font-medium">
                        <span className="min-w-0 break-words">
                          <span className="text-ndp-text-dim">{m.service.name}:</span> {m.qualityProfileName}
                        </span>
                        <button onClick={() => deleteMapping(m.id)} aria-label={t('common.delete')} className="w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-md hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                    {services.map((svc) => (
                      <button key={svc.id} onClick={() => openMapping(opt.id, svc.id)} className="inline-flex items-center gap-1.5 max-w-full min-h-[36px] text-sm px-3 rounded-lg border border-dashed border-white/[0.12] text-ndp-text-muted hover:border-ndp-accent/50 hover:text-ndp-accent transition-colors">
                        <Plus className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{svc.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Roles, checkbox list group */}
                <div role="group" aria-labelledby={`${groupId}-roles`}>
                  <span id={`${groupId}-roles`} className="admin-group-label block">{t('admin.quality.allowed_roles')}</span>
                  <div className="admin-group divide-y divide-white/[0.06]">
                    {roles.map((role) => {
                      const isAllowed = allowedRoles.includes(role.name);
                      return (
                        <button
                          key={role.id}
                          onClick={() => updateAllowedRoles(opt.id, role.name, !isAllowed)}
                          className={clsx('admin-row w-full text-left transition-colors hover:bg-white/[0.03]', isAllowed ? 'text-ndp-text' : 'text-ndp-text-muted')}
                        >
                          <div className={clsx('w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors', isAllowed ? 'bg-ndp-accent border-ndp-accent' : 'border-white/20')}>
                            {isAllowed && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="text-sm font-medium capitalize">{role.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="admin-hint">
                    {allowedRoles.length === 0 ? t('admin.quality.all_roles') : t('admin.quality.restricted_roles', { count: allowedRoles.length })}
                  </p>
                </div>

                {/* Approval, segmented control (radiogroup-like) */}
                <div role="group" aria-labelledby={`${groupId}-approval`}>
                  <span id={`${groupId}-approval`} className="admin-group-label block">{t('admin.quality.approval_mode')}</span>
                  <div className="flex gap-1 bg-ndp-surface-light border border-white/[0.06] rounded-lg p-1">
                    {([
                      { value: null, labelKey: 'admin.quality.approval_inherit', style: 'bg-white/10 text-ndp-text' },
                      { value: 'auto', labelKey: 'admin.quality.approval_auto', style: 'bg-ndp-success/15 text-ndp-success' },
                      { value: 'manual', labelKey: 'admin.quality.approval_manual', style: 'bg-ndp-warning/15 text-ndp-warning' },
                    ] as const).map((mode) => (
                      <button
                        key={String(mode.value)}
                        onClick={() => updateApprovalMode(opt.id, mode.value)}
                        className={clsx(
                          'flex-1 min-w-0 text-xs font-medium px-2 min-h-[36px] rounded-md transition-colors duration-150',
                          opt.approvalMode === mode.value ? mode.style : 'text-ndp-text-dim hover:text-ndp-text-muted',
                        )}
                      >
                        {t(mode.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {services.length === 0 && options.length > 0 && (
        <div className="admin-group px-5 py-6 text-center text-sm text-ndp-text-muted">
          <p>{t('admin.quality.no_services')}</p>
        </div>
      )}

      {/* Profile select modal */}
      {editingMapping && createPortal(
        <div className="modal-overlay z-50" onMouseDown={() => setEditingMapping(null)}>
          <div
            ref={mappingDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={mappingTitleId}
            className="modal-panel px-5 pt-6 pb-5 sm:p-6 w-full max-w-md"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id={mappingTitleId} className="text-lg font-semibold text-ndp-text mb-1">{t('admin.quality.select_profile')}</h3>
            <p className="text-xs text-ndp-text-dim mb-4 break-words">
              {options.find(o => o.id === editingMapping.qualityOptionId)?.label} → {services.find(s => s.id === editingMapping.serviceId)?.name}
            </p>
            {loadingProfiles ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-ndp-accent" /></div>
            ) : profiles.length === 0 ? (
              <p className="text-ndp-text-muted text-sm py-4">{t('admin.quality.profiles_error')}</p>
            ) : (
              <div className="admin-group divide-y divide-white/[0.06] max-h-[300px] overflow-y-auto">
                {profiles.map((p) => {
                  const isSelected = selectedProfiles.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProfiles(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                      className={clsx(
                        'admin-row w-full text-left text-sm font-medium justify-between transition-colors',
                        isSelected
                          ? 'bg-ndp-accent/[0.08] text-ndp-accent'
                          : 'text-ndp-text hover:bg-white/[0.03]'
                      )}
                    >
                      <span className="min-w-0 break-words">{p.name}</span>
                      {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedProfiles.size > 0 && (
              <p className="admin-hint">{t('common.selected', { count: selectedProfiles.size })}</p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditingMapping(null)} className="btn-secondary text-sm px-4 py-2">{t('common.cancel')}</button>
              <button onClick={saveMappings} disabled={selectedProfiles.size === 0 || savingMapping} className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50">
                {savingMapping && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t('common.save')} {selectedProfiles.size > 0 && `(${selectedProfiles.size})`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
