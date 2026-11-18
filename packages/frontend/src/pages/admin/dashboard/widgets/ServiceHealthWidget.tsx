import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { Spinner } from '@/components/Spinner';

interface Service { id: number; name: string; type: string; enabled: boolean }
interface HealthState { status: 'loading' | 'ok' | 'error'; version?: string; error?: string }

export function ServiceHealthWidget() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [health, setHealth] = useState<Record<number, HealthState>>({});

  useEffect(() => {
    let cancelled = false;
    api.get<Service[]>('/admin/services')
      .then(({ data }) => { if (!cancelled) setServices(data.filter((s) => s.enabled)); })
      .catch(() => { if (!cancelled) setServices([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!services) return;
    let cancelled = false;
    setHealth(Object.fromEntries(services.map((s) => [s.id, { status: 'loading' as const }])));
    services.forEach((s) => {
      api.post<{ ok: boolean; version?: string }>(`/admin/services/${s.id}/test`)
        .then(({ data }) => {
          if (cancelled) return;
          setHealth((h) => ({ ...h, [s.id]: { status: data.ok ? 'ok' : 'error', version: data.version, error: data.ok ? undefined : 'Unreachable' } }));
        })
        .catch((err) => {
          if (cancelled) return;
          setHealth((h) => ({ ...h, [s.id]: { status: 'error', error: (err as Error).message } }));
        });
    });
    return () => { cancelled = true; };
  }, [services]);

  const sorted = useMemo(() => services ? [...services].sort((a, b) => a.name.localeCompare(b.name)) : [], [services]);

  if (!services) {
    return <div className="card p-4 h-full"><p className="text-xs text-ndp-text-dim">Loading…</p></div>;
  }
  if (services.length === 0) {
    return <div className="card p-4 h-full"><p className="text-xs text-ndp-text-dim">No services configured.</p></div>;
  }

  return (
    <div className="card h-full overflow-auto">
      <ul className="divide-y divide-white/[0.06]">
        {sorted.map((s) => {
          const h = health[s.id];
          return (
            <li key={s.id} className="admin-row !min-h-0 !py-2.5">
              <span className={clsx('admin-icon-tile',
                h?.status === 'ok' && 'bg-emerald-500/15 text-emerald-400',
                h?.status === 'error' && 'bg-red-500/15 text-red-400')}>
                {h?.status === 'error' ? <AlertCircle className="h-4 w-4" /> : h?.status === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <Spinner size="sm" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-ndp-text">{s.name}</p>
                <p className="text-[11px] text-ndp-text-dim uppercase tracking-wide">{s.type}</p>
              </div>
              {h?.status === 'ok' && <span className="max-w-[9rem] truncate font-mono text-xs text-ndp-text-dim" title={h.version}>{h.version || 'OK'}</span>}
              {h?.status === 'error' && <span className="max-w-[10rem] truncate text-xs text-red-300">{h.error || 'Error'}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
