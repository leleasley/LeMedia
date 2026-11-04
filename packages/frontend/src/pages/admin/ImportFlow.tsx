import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadCloud, AlertCircle, CheckCircle2, Users, FileText } from 'lucide-react';
import api from '@/lib/api';
import { showToast, toastApiError } from '@/utils/toast';

interface ImportFlowProps {
  /** Optional callback after a successful import — used by the install
   *  wizard to advance to the next step. Admin-tab usage omits it. */
  onDone?: () => void;
}

type ImportSource = 'overseerr' | 'jellyseerr' | 'seerr';

interface CanonicalUser {
  sourceId: string;
  email: string | null;
  displayName: string | null;
  plexId?: string | null;
  jellyfinId?: string | null;
  isAdmin: boolean;
}

interface UserMatch {
  sourceUser: CanonicalUser;
  lemediaUserId: number | null;
  strategy: 'plex_id' | 'jellyfin_id' | 'email' | 'manual' | 'create' | 'skip';
}

interface ImportPreview {
  source: ImportSource;
  users: { total: number; matched: UserMatch[]; needsDecision: UserMatch[] };
  requests: {
    total: number;
    importable: number;
    conflicts: Array<{ reason: 'duplicate' | 'no_user' | 'tmdb_missing' }>;
  };
}

type Decision = { sourceId: string; action: 'link' | 'create' | 'skip'; lemediaUserId?: number };

const SOURCES: Array<{ id: ImportSource; label: string }> = [
  { id: 'overseerr', label: 'Overseerr' },
  { id: 'jellyseerr', label: 'Jellyseerr' },
  { id: 'seerr', label: 'Seerr' },
];

export function ImportFlow({ onDone }: Readonly<ImportFlowProps> = {}) {
  const { t } = useTranslation();

  const [source, setSource] = useState<ImportSource>('overseerr');
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Map<string, Decision['action']>>(new Map());

  async function runPreview() {
    if (!url.trim() || !apiKey.trim()) {
      showToast(t('admin.import.creds_required'), 'error');
      return;
    }
    setPreviewing(true);
    try {
      const res = await api.post<ImportPreview>('/admin/import/preview', {
        source,
        url: url.trim(),
        apiKey: apiKey.trim(),
      });
      setPreview(res.data);
      // Default every needs-decision user to "create" — admin can flip individuals.
      const next = new Map<string, Decision['action']>();
      for (const m of res.data.users.needsDecision) next.set(m.sourceUser.sourceId, 'create');
      setDecisions(next);
    } catch (err) {
      toastApiError(err, t('admin.import.preview_failed'));
    } finally {
      setPreviewing(false);
    }
  }

  async function runExecute() {
    if (!preview) return;
    setExecuting(true);
    try {
      const payload: Decision[] = preview.users.needsDecision.map((m) => ({
        sourceId: m.sourceUser.sourceId,
        action: decisions.get(m.sourceUser.sourceId) ?? 'create',
      }));
      const res = await api.post<{
        usersCreated: number;
        usersLinked: number;
        requestsCreated: number;
        requestsSkipped: number;
      }>('/admin/import/execute', {
        source,
        url: url.trim(),
        apiKey: apiKey.trim(),
        decisions: payload,
      });
      showToast(
        t('admin.import.done', {
          users: res.data.usersCreated + res.data.usersLinked,
          requests: res.data.requestsCreated,
        }),
        'success'
      );
      setPreview(null);
      setApiKey('');
      onDone?.();
    } catch (err) {
      toastApiError(err, t('admin.import.execute_failed'));
    } finally {
      setExecuting(false);
    }
  }

  const conflictsByReason = preview
    ? preview.requests.conflicts.reduce<Record<string, number>>((acc, c) => {
        acc[c.reason] = (acc[c.reason] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  return (
    <div className="space-y-8 max-w-3xl">
      <p className="text-sm text-ndp-text-muted leading-relaxed">{t('admin.import.intro')}</p>

        {/* Step 1, credentials */}
        <section>
          <div className="admin-group-label flex items-center gap-1.5">
            <DownloadCloud className="w-3.5 h-3.5" />
            {t('admin.import.step_source')}
          </div>
          <div className="admin-group p-4 sm:p-5 space-y-4">
            {/* Source picker, segmented control, stretches full width on phones. */}
            <div className="flex w-full sm:w-auto sm:inline-flex rounded-lg bg-white/[0.04] p-0.5 ring-1 ring-inset ring-white/[0.06]">
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSource(s.id)}
                  className={
                    'flex-1 sm:flex-none h-9 px-4 rounded-md text-sm font-medium transition-colors ' +
                    (source === s.id
                      ? 'bg-ndp-surface-light text-ndp-text shadow-sm'
                      : 'text-ndp-text-muted hover:text-ndp-text')
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-ndp-text-muted">
                {t('admin.import.url_label')}
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://overseerr.example.com"
                  className="input mt-1.5 w-full text-sm py-2.5"
                />
              </label>
              <label className="block text-xs font-medium text-ndp-text-muted">
                {t('admin.import.api_key_label')}
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  className="input mt-1.5 w-full text-sm py-2.5"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={runPreview}
                disabled={previewing}
                className="btn-primary text-sm w-full sm:w-auto disabled:opacity-50"
              >
                {previewing ? t('admin.import.previewing') : t('admin.import.run_preview')}
              </button>
            </div>
          </div>
        </section>

        {/* Step 2, preview + decisions */}
        {preview && (
          <section className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Stat icon={Users} label={t('admin.import.users_matched')} value={preview.users.matched.length} sub={t('admin.import.of_total', { total: preview.users.total })} />
              <Stat icon={FileText} label={t('admin.import.requests_importable')} value={preview.requests.importable} sub={t('admin.import.of_total', { total: preview.requests.total })} />
            </div>

            {Object.keys(conflictsByReason).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {conflictsByReason.duplicate ? (
                  <span className="admin-chip bg-ndp-warning/15 text-ndp-warning"><AlertCircle className="w-3 h-3" />{t('admin.import.conflict_duplicate', { count: conflictsByReason.duplicate })}</span>
                ) : null}
                {conflictsByReason.no_user ? (
                  <span className="admin-chip bg-ndp-warning/15 text-ndp-warning"><AlertCircle className="w-3 h-3" />{t('admin.import.conflict_no_user', { count: conflictsByReason.no_user })}</span>
                ) : null}
                {conflictsByReason.tmdb_missing ? (
                  <span className="admin-chip bg-ndp-warning/15 text-ndp-warning"><AlertCircle className="w-3 h-3" />{t('admin.import.conflict_tmdb_missing', { count: conflictsByReason.tmdb_missing })}</span>
                ) : null}
              </div>
            )}

            {preview.users.needsDecision.length > 0 && (
              <div>
                <div className="admin-group-label">
                  {t('admin.import.users_need_decision', { count: preview.users.needsDecision.length })}
                </div>
                <div className="admin-group divide-y divide-white/[0.06] max-h-[320px] overflow-y-auto">
                  {preview.users.needsDecision.map((m) => {
                    const id = m.sourceUser.sourceId;
                    const action = decisions.get(id) ?? 'create';
                    return (
                      <div key={id} className="admin-row text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-ndp-text font-medium">{m.sourceUser.displayName ?? m.sourceUser.email ?? `#${id}`}</div>
                          <div className="truncate text-xs text-ndp-text-dim mt-0.5">{m.sourceUser.email ?? '-'}</div>
                        </div>
                        <select
                          value={action}
                          onChange={(e) => {
                            const next = new Map(decisions);
                            next.set(id, e.target.value as Decision['action']);
                            setDecisions(next);
                          }}
                          className="input h-10 py-0 px-3 text-xs flex-shrink-0"
                        >
                          <option value="create">{t('admin.import.action_create')}</option>
                          <option value="skip">{t('admin.import.action_skip')}</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="btn-secondary text-sm flex-1 sm:flex-none"
              >
                {t('admin.import.cancel')}
              </button>
              <button
                type="button"
                onClick={runExecute}
                disabled={executing}
                className="btn-primary text-sm flex-1 sm:flex-none inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {executing ? t('admin.import.executing') : t('admin.import.run_execute')}
              </button>
            </div>
          </section>
        )}
    </div>
  );
}

interface StatProps {
  icon: typeof Users;
  label: string;
  value: number;
  sub?: string;
}

function Stat({ icon: Icon, label, value, sub }: Readonly<StatProps>) {
  return (
    <div className="admin-group px-3.5 py-3 min-w-0">
      <div className="text-xs text-ndp-text-muted flex items-center gap-1.5 min-w-0">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-ndp-text tabular-nums mt-1 leading-none">{value}</div>
      {sub && <div className="text-[11px] text-ndp-text-dim mt-1.5">{sub}</div>}
    </div>
  );
}
