import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Film, Loader2, Tv } from 'lucide-react';
import api from '@/lib/api';
import { extractApiError } from '@/utils/toast';

interface SyncResult {
  radarr?: { added: number; updated?: number };
  sonarr?: { added: number; updated?: number };
}

interface Props {
  onComplete: () => void;
}

// The backend's /setup/sync is a single blocking call (no progress stream), so we drive a
// realistic-looking progress bar from the client side: it ramps to 95% along an expected
// duration and snaps to 100% the moment the response lands. Phase captions cycle with the
// progress band so the user gets a sense of what's happening rather than a static spinner.
const PHASES = [
  { from: 0,  to: 40, key: 'install.sync.phase_radarr' as const },
  { from: 40, to: 80, key: 'install.sync.phase_sonarr' as const },
  { from: 80, to: 95, key: 'install.sync.phase_index' as const },
];
const EXPECTED_DURATION_MS = 30_000;

/** The defaults a new install needs, picked the way the old Defaults step pre-selected them:
 *  the built-in quality options mapped onto the *arr profiles, and each *arr's first root
 *  folder as the default. Best effort — anything missing can be set later in Admin. */
async function applyDefaults() {
  try {
    const { data: options } = await api.get<unknown[]>('/admin/quality-options');
    if (!Array.isArray(options) || options.length === 0) await api.post('/admin/quality-options/seed');
    await api.post('/admin/quality-mappings/auto');
  } catch { /* quality can be set up in Admin → Quality */ }
  try {
    const { data: services } = await api.get<{ id: number; type: string; enabled: boolean }[]>('/admin/services');
    const firstFolder = async (type: string) => {
      for (const svc of services.filter((s) => s.type === type && s.enabled)) {
        const { data } = await api.get<{ path: string }[]>(`/admin/services/${svc.id}/rootfolders`).catch(() => ({ data: [] as { path: string }[] }));
        if (data[0]?.path) return data[0].path;
      }
      return undefined;
    };
    const [movie, tv] = await Promise.all([firstFolder('radarr'), firstFolder('sonarr')]);
    if (movie || tv) await api.put('/admin/settings', { defaultMovieFolder: movie, defaultTvFolder: tv });
  } catch { /* folders can be set in Admin → Paths */ }
}

export default function SyncStep({ onComplete }: Readonly<Props>) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState('');
  const startedAtRef = useRef<number | null>(null);

  const run = async () => {
    setRunning(true);
    setError('');
    setProgress(0);
    setElapsed(0);
    startedAtRef.current = Date.now();
    try {
      await applyDefaults();
      const { data } = await api.post('/setup/sync');
      if (data?.result) setResult(data.result);
      setProgress(100);
      setDone(true);
      setTimeout(onComplete, 1800);
    } catch (err) {
      setError(extractApiError(err, t('common.error')));
    } finally {
      setRunning(false);
    }
  };

  // Auto-trigger on mount.
  useEffect(() => {
    if (!done && !running) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Progress ticker: ramps to 95% over EXPECTED_DURATION_MS using a soft-easing curve so
  // the first second feels snappy and the tail decelerates. Stops once `done` flips.
  useEffect(() => {
    if (!running || done) return;
    const id = setInterval(() => {
      if (!startedAtRef.current) return;
      const t = Date.now() - startedAtRef.current;
      setElapsed(t);
      // 1 - e^{-3 * t/expected} → 95% asymptote
      const ratio = Math.min(1, 1 - Math.exp(-3 * t / EXPECTED_DURATION_MS));
      setProgress(Math.min(95, ratio * 95));
    }, 200);
    return () => clearInterval(id);
  }, [running, done]);

  const currentPhase = PHASES.find((p) => progress >= p.from && progress < p.to) ?? PHASES[PHASES.length - 1];
  const elapsedSeconds = Math.floor(elapsed / 1000);

  return (
    <div className="space-y-6">
      <header className="space-y-1 text-center">
        <h2 className="text-2xl font-bold text-ndp-text">{t('install.sync.title')}</h2>
        <p className="text-sm text-ndp-text-muted">{t('install.sync.desc')}</p>
      </header>

      {!error && (
        <div className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-ndp-text-dim">
                {done ? t('install.sync.done') : t(currentPhase.key)}
              </span>
              <span className="text-xs font-mono text-ndp-text-muted tabular-nums">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-ndp-success' : 'bg-ndp-accent'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {!done && (
              <p className="text-[11px] text-ndp-text-dim mt-1.5 tabular-nums">
                {t('install.sync.elapsed', { seconds: elapsedSeconds })}
              </p>
            )}
          </div>

          {/* Live counters (filled at the end, the backend doesn't stream) */}
          <div className="grid grid-cols-2 gap-3">
            <CountCard
              icon={<Film className="w-4 h-4" />}
              label="Radarr"
              count={result?.radarr?.added}
              accent="text-ndp-accent"
              suffix={t('install.sync.added')}
            />
            <CountCard
              icon={<Tv className="w-4 h-4" />}
              label="Sonarr"
              count={result?.sonarr?.added}
              accent="text-ndp-gold"
              suffix={t('install.sync.added')}
            />
          </div>

          {done && (
            <div className="flex items-center justify-center gap-2 text-sm text-ndp-success animate-fade-in">
              <CheckCircle className="w-4 h-4" />
              {t('install.sync.done')}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="space-y-3">
          <div className="text-xs px-3 py-2 rounded-lg bg-ndp-danger/10 text-ndp-danger">{error}</div>
          <button type="button" onClick={run} disabled={running} className="btn-primary text-sm flex items-center justify-center gap-2 mx-auto">
            {running && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('install.sync.retry')}
          </button>
        </div>
      )}
    </div>
  );
}

interface CountCardProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  accent: string;
  suffix: string;
}

function CountCard({ icon, label, count, accent, suffix }: Readonly<CountCardProps>) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${accent} mb-1.5`}>
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-ndp-text tabular-nums">
          {count !== undefined ? `+${count}` : '-'}
        </span>
        <span className="text-[11px] text-ndp-text-dim">{suffix}</span>
      </div>
    </div>
  );
}
