import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Users, Film, Server, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';

interface Stats {
  users: number | null;
  pendingRequests: number | null;
  services: number | null;
  available: number | null;
}

export function StatsCountersWidget() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats>({ users: null, pendingRequests: null, services: null, available: null });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.get('/admin/users'),
      api.get<{ pending?: number; available?: number }>('/requests/stats'),
      api.get('/admin/services'),
    ]).then((results) => {
      if (cancelled) return;
      const length = (r: PromiseSettledResult<{ data: unknown }>): number | null => {
        if (r.status !== 'fulfilled') return null;
        const d = r.value.data as { results?: unknown[]; data?: unknown[] } | unknown[];
        if (Array.isArray(d)) return d.length;
        if (Array.isArray(d?.results)) return d.results.length;
        if (Array.isArray(d?.data)) return d.data.length;
        return null;
      };
      setStats({
        users: length(results[0]),
        pendingRequests: results[1].status === 'fulfilled' ? (results[1].value.data.pending ?? null) : null,
        services: length(results[2]),
        available: results[1].status === 'fulfilled' ? (results[1].value.data.available ?? null) : null,
      });
    });
    return () => { cancelled = true; };
  }, []);

  const cards: { key: keyof Stats; label: string; icon: typeof Users; to: string; tone: string }[] = [
    { key: 'users', label: t('admin.dashboard.users'), icon: Users, to: '/admin?tab=users', tone: 'bg-sky-500/15 text-sky-300' },
    { key: 'pendingRequests', label: t('admin.dashboard.pending_requests'), icon: Film, to: '/requests', tone: 'bg-amber-500/15 text-amber-300' },
    { key: 'services', label: t('admin.dashboard.services'), icon: Server, to: '/admin?tab=services', tone: 'bg-emerald-500/15 text-emerald-300' },
    { key: 'available', label: t('admin.dashboard.available', 'Available'), icon: CheckCircle2, to: '/requests', tone: 'bg-violet-500/15 text-violet-300' },
  ];

  return (
    // Phones: compact 2×2 tiles (label left, number right) so four counters fit the widget's fixed
    // two-row height. From md up each tile is an icon, a big number and its label — and a link.
    <div className="grid h-full grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      {cards.map(({ key, label, icon: Icon, to, tone }) => (
        <Link
          key={key}
          to={to}
          className="group card min-w-0 px-3 py-2.5 md:px-5 md:py-4 flex items-center justify-between gap-2 md:gap-3 md:justify-start transition-colors hover:bg-white/[0.03]"
        >
          <span className={clsx('hidden md:flex w-10 h-10 rounded-xl items-center justify-center flex-shrink-0', tone)}>
            <Icon className="w-5 h-5" />
          </span>
          <span className="min-w-0 flex-1 md:order-none order-first">
            <span className="block truncate text-[11px] font-semibold text-ndp-text-dim uppercase tracking-[0.08em]">{label}</span>
          </span>
          <span className="text-lg md:text-4xl md:font-display leading-none text-ndp-text tabular-nums md:ml-auto">
            {stats[key] ?? '-'}
          </span>
        </Link>
      ))}
    </div>
  );
}
