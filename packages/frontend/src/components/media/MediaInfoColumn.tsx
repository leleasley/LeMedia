import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Trash2, Download, Ticket, Repeat, CheckCircle2, XCircle, Calendar, Clapperboard, Tv, X, Link2 } from 'lucide-react';
import { PluginSlot } from '@/plugins/PluginSlot';
import ActionButton from '@/components/ActionButton';
import ShareButton from '@/components/media/ShareButton';
import { MediaMetaBar } from '@/components/media/MediaMetaBar';
import { RatingsStrip, WhereToWatch, useMediaEnrichment } from './MediaEnrichment';
import { QualityPicker } from '@/components/media/QualityPicker';
import CriteriaPicker from './CriteriaPicker';
import { LanguageTags } from '@/components/media/LanguageTags';
import { ZurgStatus } from '@/components/media/ZurgStatus';
import { MediaFileInfo } from '@/components/media/MediaFileInfo';
import { PlayChooser } from '@/components/media/PlayChooser';
import type { ButtonState } from '@/utils/resolveButtonState';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { MessageSquareWarning } from 'lucide-react';

interface Props {
  onBrowseSeasons?: () => void;
  media: Record<string, any>;
  dbMedia: Record<string, any> | null;
  type: 'movie' | 'tv';
  title: string;
  year: string;
  genres?: string;
  director?: { name: string };
  trailer?: { key: string };
  isAvailable: boolean;
  buttonState: ButtonState;
  requesting: boolean;
  justRequested: boolean;
  requestError: string | null;
  download: { progress: number; timeLeft: string } | null;
  blacklisted: { reason?: string | null } | null;
  searchMissingError?: string;
  onRequest: () => void;
  onSearchMissing: () => void;
  onDeleteMedia?: () => void;
  onLinkSeries?: () => void;
  onReportIssue?: () => void;
  qualityOptions: { id: number; label: string }[];
  selectedCriteria: Record<number, number>;
  setSelectedCriteria: (next: Record<number, number>) => void;
  takenQualityIds: Set<number>;
  selectedQuality: number | null;
  setSelectedQuality: (updater: (prev: number | null) => number | null) => void;
  audioLanguages: string[];
  subtitleLanguages: string[];
  libraryLoading: boolean;
  readOnly?: boolean;
  /** The viewer has an active request for this title (drives the 'still searching' note). */
  userHasRequest?: boolean;
  /** Which service holds an import-list exclusion for this title, if any. */
  excludedBy?: 'radarr' | 'sonarr' | null;
}

/** Title, facts, synopsis, actions and request options in the hero's readable left column. */
export function MediaInfoColumn({
  onBrowseSeasons,
  media, dbMedia, type, title, year, genres, director, trailer,
  isAvailable, buttonState,
  requesting, justRequested, requestError, download, blacklisted, searchMissingError,
  onRequest, onSearchMissing, onDeleteMedia, onLinkSeries, onReportIssue,
  qualityOptions, takenQualityIds, selectedQuality, setSelectedQuality,
  selectedCriteria, setSelectedCriteria,
  audioLanguages, subtitleLanguages, libraryLoading, readOnly, userHasRequest, excludedBy,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [trailerOpen, setTrailerOpen] = useState(false);
  const enrichment = useMediaEnrichment(type, media.id, !readOnly);
  useEffect(() => { setTrailerOpen(false); }, [type, media.id]);
  useEffect(() => {
    if (!trailerOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setTrailerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trailerOpen]);

  // Deep link into the plugin that manages this title. Only rendered when the media is actually
  // tracked by an *arr and the viewer can reach the admin area — a dead link is worse than none.
  const arrPlugin = type === 'movie'
    ? (dbMedia?.radarrId ? { id: 'radarr', param: 'movieId', value: dbMedia.radarrId, label: t('media.open_in_radarr') } : null)
    : (dbMedia?.sonarrId ? { id: 'sonarr', param: 'seriesId', value: dbMedia.sonarrId, label: t('media.open_in_sonarr') } : null);

  // Original title — shown only when it differs from the displayed one, which is itself a
  // strong signal that the title is foreign (기생충 vs "Parasite").
  const originalTitle = type === 'movie'
    ? (media.original_title as string | undefined)
    : (media.original_name as string | undefined);
  const showOriginalTitle = !!originalTitle && originalTitle.trim() !== title.trim();

  return (
      <div className="flex-1 min-w-0">
        <h1 id="media-title" tabIndex={-1} className="media-detail-title font-extrabold text-white outline-none">{title}</h1>

        {showOriginalTitle && (
          <p className="text-ndp-text-dim text-sm mt-1.5" title={t('media.original_title')}>
            {originalTitle}
          </p>
        )}

        {media.tagline && (
          <p className="text-ndp-text-muted italic mt-2">{media.tagline}</p>
        )}

        <MediaMetaBar
          year={year}
          runtime={media.runtime}
          voteAverage={media.vote_average}
          voteCount={media.vote_count}
          numberOfSeasons={media.number_of_seasons}
          type={type}
          genres={genres}
          originalLanguage={media.original_language}
        />

        <RatingsStrip ratings={enrichment?.ratings ?? []} />

        {/* Series / movie status + network, TMDB-driven. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {type === 'tv' && typeof media.status === 'string' && !!media.status && (
            <SeriesStatusPill status={media.status} />
          )}
          {type === 'movie' && typeof media.status === 'string' && !!media.status && media.status !== 'Released' && (
            <SeriesStatusPill status={media.status} />
          )}
          {type === 'tv' && (media as { networks?: { name: string; logo_path: string | null }[] }).networks && (
            <NetworkBadge networks={(media as { networks?: { name: string; logo_path: string | null }[] }).networks} />
          )}
          {type === 'movie' && (media as { production_companies?: { name: string; logo_path: string | null }[] }).production_companies && (
            <NetworkBadge networks={(media as { production_companies?: { name: string; logo_path: string | null }[] }).production_companies} />
          )}
        </div>

        {/* Digital status pill, "Released" once the digital date has passed, "In Cinemas"
            while it's theatrically out but not yet digital, otherwise the upcoming date.
            Hidden when the digital date matches the theatrical date (same day stated twice). */}
        {type === 'movie'
          && !!((dbMedia?.digitalReleaseDate || media.digitalRelease) as string | null)
          && (dbMedia?.digitalReleaseDate || media.digitalRelease) !== media.release_date && (
          <DigitalStatusPill
            digitalDate={(dbMedia?.digitalReleaseDate || media.digitalRelease) as string}
            theatricalDate={media.release_date as string | undefined}
          />
        )}

        {/* Synopsis */}
        <div className="mt-6">
          <h2 className="sr-only">{t('media.synopsis')}</h2>
          <p className="text-ndp-text/80 leading-relaxed">{media.overview || t('media.no_description')}</p>

          {/* Plugin hook: media detail info */}
          <PluginSlot hookPoint="media.detail.info" context={{ media, type, dbMedia }} />
        </div>

        {/* Director */}
        {director && (
          <p className="mt-4 text-sm text-ndp-text-muted">
            {t('media.directed_by', { name: director.name })}
          </p>
        )}

        {/* Actions, primary CTA first (full width on phones), secondary actions beneath */}
        <div className="mt-7 space-y-3">
          {!readOnly && (
            <div className="flex [&>*]:w-full sm:[&>*]:w-auto [&>*]:justify-center [&>*]:min-h-[48px] sm:[&>*]:min-h-0">
              <ActionButton
                loading={libraryLoading}
                requestLabel={onBrowseSeasons ? t('media.explorer.request_series') : undefined}
                state={buttonState}
                requesting={requesting}
                justRequested={justRequested}
                download={download}
                searchMissingError={searchMissingError}
                blacklistReason={blacklisted?.reason ?? undefined}
                onRequest={onRequest}
                onSearchMissing={type === 'tv' ? onRequest : onSearchMissing}
                t={t}
              />
            </div>
          )}
          {readOnly && (
            <Link to="/login" className="btn-primary inline-flex w-full sm:w-auto justify-center">Sign in to request</Link>
          )}
          {excludedBy && !readOnly && !isAvailable && (
            <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 text-amber-200 text-xs leading-relaxed">
              {isAdmin
                ? t('media.excluded_note_admin', 'This title is on {{service}}\'s import-list exclusions. Requesting it removes the exclusion and adds it.', {
                    service: excludedBy === 'radarr' ? 'Radarr' : 'Sonarr',
                  })
                : t('media.excluded_note', 'This title is on {{service}}\'s import-list exclusions. You can still request it — an admin approves the request, which removes the exclusion and adds it.', {
                    service: excludedBy === 'radarr' ? 'Radarr' : 'Sonarr',
                  })}
            </div>
          )}

          {buttonState === 'searching' && userHasRequest && (
            <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 text-amber-200 text-xs leading-relaxed">
              No torrents found yet, Radarr is still searching in the background and will retry automatically. Try a different quality above if you want to broaden the search.
            </div>
          )}

          {/* Request error message + inline retry next to the CTA that failed */}
          {requestError && !readOnly && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ndp-danger/10 ring-1 ring-inset ring-ndp-danger/20 text-ndp-danger text-sm animate-fade-in">
              <span className="flex-1">{requestError}</span>
              <button
                type="button"
                onClick={onRequest}
                disabled={requesting}
                className="flex-shrink-0 px-2.5 py-1 rounded-md bg-ndp-danger/15 hover:bg-ndp-danger/25 font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
          {requestError && readOnly && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ndp-danger/10 ring-1 ring-inset ring-ndp-danger/20 text-ndp-danger text-sm animate-fade-in">
              {requestError}
            </div>
          )}

          {!readOnly && !isAvailable && <ZurgStatus mediaType={type} tmdbId={media.id} />}

          <div className="flex flex-wrap gap-2">
            {isAvailable && !readOnly && <PlayChooser mediaType={type} tmdbId={media.id} />}
            {trailer && (
              <button onClick={() => setTrailerOpen(true)} className="btn-secondary flex items-center gap-2 !px-4">
                <Play className="w-4 h-4 fill-current" />
                {t('media.trailer')}
              </button>
            )}
            {!readOnly && onReportIssue && (
              <button type="button" onClick={onReportIssue} className="btn-secondary flex items-center gap-2 !px-4">
                <MessageSquareWarning className="w-4 h-4" />
                {t('media.report_issue', 'Report an issue')}
              </button>
            )}
            {!readOnly && <ShareButton tmdbId={media.id} mediaType={type} title={title} />}
            {!readOnly && isAdmin && type === 'tv' && onLinkSeries && (
              <button
                type="button"
                onClick={onLinkSeries}
                className="btn-secondary flex items-center gap-2 !px-4"
                title={t('media.link_series.hint', 'Use this when TMDB and TVDB disagree about a show. The link follows TVDB season numbering.')}
              >
                <Link2 className="w-4 h-4" />
                {t('media.link_series.button', 'Link to Sonarr')}
              </button>
            )}
            {isAdmin && onDeleteMedia && (
              <button
                type="button"
                onClick={onDeleteMedia}
                className="btn-danger flex items-center gap-2 !px-4"
              >
                <Trash2 className="w-4 h-4" />
                {t('common.delete', 'Delete')}
              </button>
            )}
            {/* Plugin hook: media detail actions */}
            <PluginSlot hookPoint="media.detail.actions" context={{ media, type, isAvailable, dbMedia }} />
          </div>

          <WhereToWatch providers={enrichment?.providers ?? null} />

          {trailerOpen && trailer && (
            <div role="dialog" aria-modal="true" aria-label={t('media.trailer')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-fade-in" onClick={() => setTrailerOpen(false)}>
              <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end mb-2">
                  <button onClick={() => setTrailerOpen(false)} aria-label={t('common.close')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
                <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0`}
                    title={t('media.trailer')}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {!onBrowseSeasons && <>
        <QualityPicker
          options={qualityOptions}
          takenIds={takenQualityIds}
          selected={selectedQuality}
          onSelect={setSelectedQuality}
        />

        <CriteriaPicker
          selected={selectedCriteria}
          onSelect={(criterionId, valueId) => {
            const next = { ...selectedCriteria };
            if (valueId === null) delete next[criterionId];
            else next[criterionId] = valueId;
            setSelectedCriteria(next);
          }}
        />
        </>}

        {/* What is actually on disk, read from the file after import. Descriptive, not a choice —
            the pickers above are the choices. */}
        <LanguageTags audioLanguages={audioLanguages} subtitleLanguages={subtitleLanguages} loading={libraryLoading} />

        {isAvailable && <MediaFileInfo mediaType={type} tmdbId={media.id} />}
      </div>
  );
}

function NetworkBadge({ networks }: Readonly<{ networks?: { name: string; logo_path: string | null }[] }>) {
  // Prefer the first entry with a logo — many companies/networks have none, and a text-only
  // pill adds noise. Nothing with a logo at all → hide rather than show a bare name.
  const primary = networks?.find((n) => n.logo_path) ?? networks?.[0];
  if (!primary) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-black text-xs font-semibold">
      {primary.logo_path ? (
        <img src={`https://image.tmdb.org/t/p/w92${primary.logo_path}`} alt={primary.name} className="h-3.5 w-auto object-contain" loading="lazy" />
      ) : null}
      <span>{primary.name}</span>
    </span>
  );
}

/** Status-aware digital pill: "Released" once the digital date has passed, "In Cinemas"
 *  while it's theatrically out but not yet digital, otherwise the upcoming digital date. */
function DigitalStatusPill({ digitalDate, theatricalDate }: Readonly<{
  digitalDate: string;
  theatricalDate?: string;
}>) {
  const { t } = useTranslation();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const released = new Date(`${digitalDate}T00:00:00`) <= startOfToday;
  const inCinemas = !released && !!theatricalDate && new Date(`${theatricalDate}T00:00:00`) <= startOfToday;

  const pill = 'inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full ring-1 ring-inset';

  if (released) {
    return (
      <div className="mt-3">
        <span className={`${pill} bg-emerald-500/15 text-emerald-300 ring-emerald-400/30`}>
          <Download className="w-3.5 h-3.5" />
          {t('media.released')}
        </span>
      </div>
    );
  }

  const formatted = new Date(`${digitalDate}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {inCinemas && (
        <span className={`${pill} bg-amber-500/15 text-amber-300 ring-amber-400/30`}>
          <Ticket className="w-3.5 h-3.5" />
          {t('media.in_cinemas')}
        </span>
      )}
      <span className={`${pill} bg-sky-500/15 text-sky-300 ring-sky-400/30`}>
        <Download className="w-3.5 h-3.5" />
        {t('media.digital_release', { date: formatted })}
      </span>
    </div>
  );
}

function SeriesStatusPill({ status }: Readonly<{ status: string }>) {
  const { t } = useTranslation();
  const key = status.trim().toLowerCase();

  // TMDB TV: Returning Series, Ended, Canceled/Cancelled, In Production, Planned, Pilot
  // TMDB Movie: Rumored, Planned, In Production, Post Production, Released, Canceled
  type Cfg = { label: string; grad: string; Icon: typeof Repeat };
  const map: Record<string, Cfg> = {
    'returning series': { label: t('media.series_status.continuing'), grad: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30', Icon: Repeat },
    'continuing':       { label: t('media.series_status.continuing'), grad: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30', Icon: Repeat },
    'ended':            { label: t('media.series_status.ended'), grad: 'bg-slate-500/15 text-slate-300 ring-slate-400/30', Icon: CheckCircle2 },
    'canceled':         { label: t('media.series_status.canceled'), grad: 'bg-red-500/15 text-red-300 ring-red-400/30', Icon: XCircle },
    'cancelled':        { label: t('media.series_status.canceled'), grad: 'bg-red-500/15 text-red-300 ring-red-400/30', Icon: XCircle },
    'in production':    { label: t('media.series_status.in_production'), grad: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', Icon: Clapperboard },
    'planned':          { label: t('media.series_status.planned'), grad: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', Icon: Calendar },
    'pilot':            { label: t('media.series_status.pilot'), grad: 'bg-sky-500/15 text-sky-300 ring-sky-400/30', Icon: Tv },
    'rumored':          { label: t('media.series_status.rumored'), grad: 'bg-slate-500/15 text-slate-300 ring-slate-400/30', Icon: Calendar },
    'post production':  { label: t('media.series_status.post_production'), grad: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', Icon: Clapperboard },
    'released':         { label: t('media.series_status.released'), grad: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30', Icon: CheckCircle2 },
  };

  const cfg = map[key] ?? { label: status, grad: 'bg-slate-500/15 text-slate-300 ring-slate-400/30', Icon: Tv };
  const pill = 'inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full ring-1 ring-inset';
  const Icon = cfg.Icon;

  return (
    <span className={`${pill} ${cfg.grad}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}
