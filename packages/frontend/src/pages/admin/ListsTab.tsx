import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import { AdminTabLayout } from './AdminTabLayout';
import { ListSubscriptions } from './lists/ListSubscriptions';
import { ListAdd } from './lists/ListAdd';
import { ListCustom } from './lists/ListCustom';
import { ListSettings } from './lists/ListSettings';
import type { ListsSettings } from './lists/shared';

type View = 'subscriptions' | 'add' | 'handmade' | 'settings';
const VIEWS: { id: View; label: string }[] = [
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'add', label: 'Add a list' },
  { id: 'handmade', label: 'Handmade' },
  { id: 'settings', label: 'Settings' },
];

/** Admin → Media → Lists: list links and handmade lists that feed Radarr and Sonarr, with
 *  optional content filters. */
export function ListsTab() {
  const [params, setParams] = useSearchParams();
  const [settings, setSettings] = useState<ListsSettings | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();

  const viewParam = params.get('view') as View | null;
  const view: View = viewParam && VIEWS.some((v) => v.id === viewParam) ? viewParam : 'subscriptions';
  const setView = (v: View) => setParams((p) => { const n = new URLSearchParams(p); n.set('view', v); return n; }, { replace: true });

  const loadSettings = useCallback(async () => {
    try { const { data } = await api.get<ListsSettings>('/admin/lists/settings'); setSettings(data); }
    catch (err) { toastApiError(err, 'Could not load list settings'); }
  }, []);
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  return (
    <AdminTabLayout>
      <div className="space-y-5">
        <div className="grid grid-cols-4 sm:flex sm:gap-1 border-b border-white/[0.06]" role="tablist">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id}
              onClick={() => { setPreviewUrl(undefined); setView(v.id); }}
              className={clsx('relative flex items-center justify-center px-1 sm:px-3.5 h-12 sm:h-11 text-[13px] sm:text-sm font-medium whitespace-nowrap transition-colors',
                view === v.id ? 'text-ndp-text' : 'text-ndp-text-muted hover:text-ndp-text')}>
              {v.label}
              {view === v.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-ndp-accent" aria-hidden />}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {view === 'subscriptions' && <ListSubscriptions onAdd={() => setView('add')} />}
          {view === 'add' && settings && <ListAdd key={previewUrl ?? 'blank'} initialUrl={previewUrl} defaults={settings.defaults} onSubscribed={() => setView('subscriptions')} />}
          {view === 'handmade' && <ListCustom onPreview={(url) => { setPreviewUrl(url); setView('add'); }} />}
          {view === 'settings' && settings && <ListSettings settings={settings} onSaved={setSettings} />}
        </div>
      </div>
    </AdminTabLayout>
  );
}
