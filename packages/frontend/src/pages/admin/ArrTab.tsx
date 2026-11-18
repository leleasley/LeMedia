import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import { AdminTabLayout } from './AdminTabLayout';
import { ArrOverview } from './arr/ArrOverview';
import { ArrActivity, ArrQueue, ArrWanted } from './arr/ArrLists';
import { ArrSettings } from './arr/ArrSettings';
import { ArrExclusions } from './arr/ArrExclusions';
import { LogConsole } from './arr/LogConsole';
import { APP_META, type AppOverview, type ArrApp, type ArrJob } from './arr/shared';
import { Spinner } from '@/components/Spinner';

type View = 'overview' | 'queue' | 'activity' | 'wanted' | 'exclusions' | 'console' | 'settings';
const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'queue', label: 'Queue' }, { id: 'activity', label: 'Activity' },
  { id: 'wanted', label: 'Wanted' }, { id: 'exclusions', label: 'Exclusions' }, { id: 'console', label: 'Console' }, { id: 'settings', label: 'Settings' },
];

interface OverviewResp { apps: AppOverview[]; helper: boolean; jobs: ArrJob[] }

/** Admin → Media → Radarr & Sonarr: status, updates, restart, queue, activity, wanted and logs
 *  for the *arrs configured in Services. */
export function ArrTab() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<OverviewResp | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [consoleApp, setConsoleApp] = useState<ArrApp>('sonarr');

  const v = params.get('view') as View | null;
  const view: View = v && VIEWS.some((x) => x.id === v) ? v : 'overview';
  const setView = (next: View) => setParams((p) => { const n = new URLSearchParams(p); n.set('view', next); return n; }, { replace: true });

  const load = useCallback(async (fresh = false) => {
    try { const { data: d } = await api.get<OverviewResp>(`/admin/arr/overview${fresh ? '?fresh=1' : ''}`); setData(d); }
    catch (err) { if (fresh) toastApiError(err, 'Could not reach Radarr and Sonarr'); }
  }, []);
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(id); }, [load]);

  const apps = data?.apps.filter((a) => a.app !== 'prowlarr') ?? [];
  const updates = apps.filter((a) => a.update?.available).length;

  return (
    <AdminTabLayout actions={view === 'overview' ? (
      <button type="button" className="btn-secondary flex items-center gap-2 !px-3.5 !py-2 !text-sm" disabled={refreshing}
        onClick={async () => { setRefreshing(true); await load(true); setRefreshing(false); }}>
        <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />Check now
      </button>
    ) : undefined}>
      <div className="space-y-5">
        <div className="flex gap-1 border-b border-white/[0.06] overflow-x-auto edge-fade-x sm:[mask-image:none]" role="tablist">
          {VIEWS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={view === x.id} onClick={() => setView(x.id)}
              className={clsx('relative flex items-center gap-2 px-3.5 h-11 text-sm font-medium whitespace-nowrap transition-colors', view === x.id ? 'text-ndp-text' : 'text-ndp-text-muted hover:text-ndp-text')}>
              {x.label}
              {x.id === 'overview' && updates > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center bg-ndp-accent text-white">{updates}</span>}
              {view === x.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-ndp-accent" aria-hidden />}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {view === 'overview' && (data
            ? <ArrOverview apps={apps} helper={data.helper} jobs={data.jobs} onChanged={() => void load(true)} onSettings={() => setView('settings')} />
            : <div className="admin-group admin-row justify-center py-12 text-sm text-ndp-text-dim"><Spinner size="sm" />Asking Sonarr and Radarr…</div>)}
          {view === 'queue' && <ArrQueue />}
          {view === 'activity' && <ArrActivity />}
          {view === 'wanted' && <ArrWanted />}
          {view === 'exclusions' && <ArrExclusions />}
          {view === 'console' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(['sonarr', 'radarr'] as ArrApp[]).map((a) => (
                  <button key={a} type="button" onClick={() => setConsoleApp(a)}
                    className={clsx('px-3 py-1.5 rounded-lg text-sm ring-1 ring-inset', consoleApp === a ? 'bg-ndp-accent/15 ring-ndp-accent/40 text-ndp-text' : 'bg-ndp-surface ring-white/[0.06] text-ndp-text-muted hover:text-ndp-text')}>
                    {APP_META[a].name}
                  </button>
                ))}
              </div>
              <LogConsole key={consoleApp} app={consoleApp} />
            </div>
          )}
          {view === 'settings' && <ArrSettings onChanged={() => void load(true)} />}
        </div>
      </div>
    </AdminTabLayout>
  );
}
