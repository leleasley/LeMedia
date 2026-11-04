import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Film, Tv, CheckCircle, LayoutGrid, List } from 'lucide-react';
import { clsx } from 'clsx';
import MediaLink from '@/components/MediaLink';
import { posterUrl } from '@/lib/api';
import { localizedDate, localizedTime } from '@/i18n/formatters';
import { useCalendar, type CalendarItem } from '@/hooks/useCalendar';
import EmptyState from '@/components/ui/EmptyState';

type ViewMode = 'grid' | 'list';

function extractPosterPath(url: string | null): string | null {
  if (!url) return null;
  const match = /\/t\/p\/\w+(\/.+?)(?:\?|$)/.exec(url);
  if (match) return match[1];
  // The calendar API sends bare TMDB paths ("/abc.jpg") so the client can pick a small size;
  // full URLs (TheTVDB fallback) pass through as-is.
  return url.startsWith('/') || url.startsWith('http') ? url : null;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PAST_DAYS = 0;
const FUTURE_DAYS = 5;

function getStoredView(): ViewMode {
  const stored = localStorage.getItem('calendar-view') as ViewMode | null;
  if (stored) return stored;
  // Day columns are cramped on a phone — default small screens to the agenda list.
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'list' : 'grid';
}

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const { items, loading } = useCalendar(30);
  const [view, setView] = useState<ViewMode>(getStoredView);

  const switchView = (v: ViewMode) => {
    setView(v);
    localStorage.setItem('calendar-view', v);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);
  const lang = i18n.language;

  // Mobile: horizontal scroll with snap, desktop: 6-col grid
  const columns: { date: Date; key: string; isPast: boolean; isToday: boolean }[] = [];
  for (let i = -PAST_DAYS; i <= FUTURE_DAYS; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    columns.push({ date: d, key: toDateKey(d), isPast: i < 0, isToday: i === 0 });
  }

  // Group + dedup episodes (clone to avoid mutating state)
  const grouped: Record<string, CalendarItem[]> = {};
  for (const item of items) {
    const d = new Date(item.date);
    if (Number.isNaN(d.getTime())) continue; // skip invalid dates
    const key = toDateKey(d);
    if (!grouped[key]) grouped[key] = [];
    if (item.type === 'episode' && item.tmdbId != null) {
      const existing = grouped[key].find(i => i.type === 'episode' && i.tmdbId === item.tmdbId);
      if (existing) {
        existing.episodeCount = (existing.episodeCount || 1) + 1;
        continue;
      }
    }
    grouped[key].push({ ...item }); // clone
  }

  // For list view: all days from today onward that have items
  const listDays = Object.keys(grouped)
    .filter(key => key >= todayKey)
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-6 md:py-8">
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <h1 className="font-display-title text-4xl text-ndp-text">{t('calendar.title')}</h1>
        </div>
        <div className="flex items-center gap-1 bg-ndp-surface rounded-lg p-1">
          <button
            onClick={() => switchView('grid')}
            aria-label={t('calendar.grid_view')}
            aria-pressed={view === 'grid'}
            className={clsx(
              'p-2 rounded-md transition-colors min-w-11 min-h-11 flex items-center justify-center',
              view === 'grid' ? 'bg-ndp-accent text-white' : 'text-ndp-text-dim hover:text-ndp-text-muted',
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => switchView('list')}
            aria-label={t('calendar.list_view')}
            aria-pressed={view === 'list'}
            className={clsx(
              'p-2 rounded-md transition-colors min-w-11 min-h-11 flex items-center justify-center',
              view === 'list' ? 'bg-ndp-accent text-white' : 'text-ndp-text-dim hover:text-ndp-text-muted',
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`skel-${i}`} className="flex items-center gap-3">
              <div className="w-11 h-16 skeleton rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-1/2 rounded" />
                <div className="skeleton h-2.5 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : view === 'list' && listDays.length === 0 ? (
        <EmptyState icon={Calendar} title={t('calendar.empty', 'Nothing coming up')} hint={t('calendar.empty_hint', 'New episodes and releases for your library will show up here.')} />
      ) : view === 'grid' ? (
        <GridView columns={columns} grouped={grouped} lang={lang} t={t} />
      ) : (
        <ListView days={listDays} grouped={grouped} todayKey={todayKey} t={t} />
      )}
    </div>
  );
}

// ─── Grid View (columns) ─────────────────────────────────────────────

function GridView({ columns, grouped, lang, t }: {
  columns: { date: Date; key: string; isPast: boolean; isToday: boolean }[];
  grouped: Record<string, CalendarItem[]>;
  lang: string;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <div className="pb-8">
      <div className="flex gap-3 w-full overflow-x-auto pb-3 snap-x snap-mandatory md:overflow-visible md:snap-none -mx-4 px-4 md:mx-0 md:px-0">
        {columns.map((col, colIndex) => {
          const dayName = col.date.toLocaleDateString(lang, { weekday: 'short' });
          const dayNum = col.date.getDate();
          const monthName = col.date.toLocaleDateString(lang, { month: 'short' });
          const dayItems = grouped[col.key] || [];
          const count = dayItems.length;
          const futureIndex = colIndex - PAST_DAYS;
          // Floor the fade so future-day text keeps readable contrast: opacity alone must
          // never be the only cue that a day is upcoming, and washed-out text helps nobody.
          const futureOpacity = col.isPast ? 0.6 : col.isToday ? 1 : Math.max(0.85, 1 - futureIndex * 0.03);

          return (
            <div
              key={col.key}
              className={clsx(
                'flex flex-col gap-2 rounded-xl p-2 transition-all flex-none snap-start min-w-[150px] w-[150px] md:flex-1 md:min-w-0 md:w-auto',
                col.isToday && 'bg-ndp-accent/[0.06]',
              )}
              style={{
                opacity: futureOpacity,
              }}
            >
              <div className={clsx(
                'rounded-lg px-3 py-3 text-center',
                col.isToday ? 'bg-ndp-accent/10 border border-ndp-accent/30' : 'border border-transparent',
              )}>
                <p className={clsx('text-[10px] uppercase tracking-wider font-semibold', col.isToday ? 'text-ndp-accent' : 'text-ndp-text-dim')}>
                  {col.isToday ? t('calendar.today') : dayName}
                </p>
                <p className={clsx('font-display text-4xl leading-none mt-1', col.isToday ? 'text-ndp-accent' : 'text-ndp-text')}>
                  {dayNum}
                </p>
                <p className={clsx('text-[10px] uppercase', col.isToday ? 'text-ndp-accent/70' : 'text-ndp-text-dim')}>
                  {monthName}
                </p>
                {count > 0 && (
                  <p className={clsx('text-[10px] font-medium mt-1', col.isToday ? 'text-ndp-accent' : 'text-ndp-text-dim')}>
                    {count} {count === 1 ? t('calendar.release_one', 'sortie') : t('calendar.release_other', 'sorties')}
                  </p>
                )}
              </div>

              {dayItems.length === 0 ? (
                <div className="flex-1 rounded-lg border border-dashed border-white/[0.06] flex items-center justify-center min-h-[80px]">
                  <span className="text-[10px] text-ndp-text-dim/30">-</span>
                </div>
              ) : (
                dayItems.map((item) => (
                  <CompactCard key={`${item.type}-${item.tmdbId ?? item.tvdbId ?? 0}-${item.season ?? 0}-${item.episode ?? 0}`} item={item} />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Compact Card (grid view) ────────────────────────────────────────

function CompactCard({ item }: { item: CalendarItem }) {
  const { t } = useTranslation();
  const link = itemLink(item);
  const ep = episodeLabel(item, t);
  const time = airTime(item);

  const inner = (
    <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-ndp-surface hover:bg-ndp-surface-light transition-colors overflow-hidden">
      <CalendarPoster item={item} size="w92" className="w-11 h-16" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-ndp-text truncate leading-tight">{item.title}</p>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1">
          {ep && <span className="text-[10px] font-semibold text-ndp-accent flex-shrink-0">{ep}</span>}
          {time && <span className="text-[10px] text-ndp-text-dim flex-shrink-0">{time}</span>}
          {item.hasFile && <CheckCircle className="w-2.5 h-2.5 text-ndp-success flex-shrink-0" />}
          {item.releaseKind === 'digital' && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-sky-200 bg-sky-500/20 ring-1 ring-inset ring-sky-400/30 px-1.5 py-px rounded-full flex-shrink-0">
              {t('calendar.digital')}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return link ? <MediaLink to={link}>{inner}</MediaLink> : <div>{inner}</div>;
}

// ─── Shared helpers ──────────────────────────────────────────────────

function itemLink(item: CalendarItem): string | null {
  if (!item.tmdbId || item.tmdbId <= 0) return null;
  return item.type === 'movie' ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;
}

function episodeLabel(item: CalendarItem, t: ReturnType<typeof useTranslation>['t']): string | null {
  if (item.episodeCount && item.episodeCount > 1) return t('calendar.episode_count', { count: item.episodeCount });
  if (item.type === 'episode' && item.season != null && item.episode != null) {
    return `S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`;
  }
  return null;
}

/** Movie dates from Radarr/TMDB are date-only (midnight UTC) — showing "00:00" is noise. */
function airTime(item: CalendarItem): string | null {
  if (item.type !== 'episode') return null;
  return localizedTime(item.date, { hour: '2-digit', minute: '2-digit' });
}

function CalendarPoster({ item, size, className }: Readonly<{ item: CalendarItem; size: string; className: string }>) {
  const [failed, setFailed] = useState(false);
  const poster = extractPosterPath(item.poster);
  return (
    <div className={clsx('poster-frame flex-shrink-0', className)}>
      {poster && !failed ? (
        <img src={posterUrl(poster, size)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-ndp-text-dim">
          {item.type === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
        </div>
      )}
    </div>
  );
}

// ─── List View (agenda) ──────────────────────────────────────────────

function ListView({ days, grouped, todayKey, t }: {
  days: string[];
  grouped: Record<string, CalendarItem[]>;
  todayKey: string;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const tomorrowKey = toDateKey(new Date(new Date(`${todayKey}T00:00:00`).getTime() + 86400000));
  const dayLabel = (key: string) =>
    key === todayKey ? t('calendar.today')
      : key === tomorrowKey ? t('calendar.tomorrow', 'Tomorrow')
        : localizedDate(key, { weekday: 'long' });

  const jumpTo = (key: string) => {
    document.getElementById(`cal-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="pb-16">
      {/* Date strip, one chip per day that has something on, tap to jump */}
      <div className="edge-fade-x flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 mb-6" style={{ scrollbarWidth: 'none' }}>
        {days.slice(0, 21).map((key) => {
          const d = new Date(`${key}T00:00:00`);
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              onClick={() => jumpTo(key)}
              className={clsx(
                'flex-shrink-0 w-[52px] py-2 rounded-lg flex flex-col items-center transition-colors active:scale-95',
                isToday ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text hover:bg-ndp-surface-light',
              )}
            >
              <span className={clsx('text-[10px] font-semibold uppercase tracking-wide', isToday ? 'text-white/85' : 'text-ndp-text-dim')}>
                {localizedDate(key, { weekday: 'short' })}
              </span>
              <span className="font-display text-2xl leading-none mt-1">{d.getDate()}</span>
              <span className={clsx('mt-1 text-[10px] font-medium', isToday ? 'text-white/85' : 'text-ndp-text-muted')}>
                {(grouped[key] || []).length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-9">
        {days.map((dateKey) => {
          const dayItems = grouped[dateKey] || [];
          if (dayItems.length === 0) return null;
          const isToday = dateKey === todayKey;
          return (
            <section key={dateKey} id={`cal-${dateKey}`} className="scroll-mt-28">
              <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-white/[0.06]">
                <h2 className={clsx('font-display-title text-[28px]', isToday ? 'text-ndp-accent' : 'text-ndp-text')}>
                  {dayLabel(dateKey)}
                </h2>
                <span className="text-xs text-ndp-text-dim whitespace-nowrap">
                  {localizedDate(dateKey, { day: 'numeric', month: 'short' })} · {t('calendar.release_count', { count: dayItems.length })}
                </span>
              </div>
              <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3 sm:gap-x-6">
                {dayItems.map((item) => (
                  <AgendaRow key={`${item.type}-${item.tmdbId ?? item.tvdbId ?? 0}-${item.season ?? 0}-${item.episode ?? 0}`} item={item} t={t} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function AgendaRow({ item, t }: Readonly<{ item: CalendarItem; t: ReturnType<typeof useTranslation>['t'] }>) {
  const link = itemLink(item);
  const ep = episodeLabel(item, t);
  const time = airTime(item);
  const subtitle = item.type === 'episode'
    ? (item.episodeCount && item.episodeCount > 1 ? null : item.episodeTitle)
    : t('common.movie');

  const inner = (
    <div className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors">
      <CalendarPoster item={item} size="w154" className="w-14 h-[84px]" />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-ndp-text truncate leading-tight">{item.title}</p>
        {subtitle && <p className="text-[13px] text-ndp-text-muted truncate mt-0.5">{subtitle}</p>}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {ep && <span className="text-[11px] font-semibold text-ndp-accent">{ep}</span>}
          {time && <span className="text-[11px] text-ndp-text-dim">{time}</span>}
          {item.releaseKind === 'digital' && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-200 bg-sky-500/15 ring-1 ring-inset ring-sky-400/30 px-1.5 py-px rounded-full">
              {t('calendar.digital')}
            </span>
          )}
          {item.hasFile && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 bg-emerald-500/15 ring-1 ring-inset ring-emerald-400/30 px-1.5 py-px rounded-full">
              <CheckCircle className="w-2.5 h-2.5" />
              {t('calendar.available', 'Available')}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return link ? <MediaLink to={link}>{inner}</MediaLink> : <div>{inner}</div>;
}
