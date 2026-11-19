import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  EyeOff,
  User,
  Clapperboard,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNsfwFilter } from '@/hooks/useNsfwFilter';
import MediaRow from '@/components/MediaRow';
import CollectionSection from '@/components/CollectionSection';
import { ScrollArrows } from '@/components/ScrollArrows';
import { useMediaDetailData } from '@/hooks/useMediaDetailData';
import api from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import { useMediaRequestActions } from '@/hooks/useMediaRequestActions';
import type { TmdbCast, TmdbCrew } from '@/types';
import { useMediaAvailability } from '@/hooks/useMediaAvailability';
import { NsfwRevealModal } from '@/components/media/NsfwRevealModal';
import DeleteMediaModal from '@/components/DeleteMediaModal';
import LinkSeriesModal from '@/components/media/LinkSeriesModal';
import { useMediaExclusion } from '@/hooks/useMediaExclusion';
import { ReportIssueModal } from '@/components/media/ReportIssueModal';
import { MediaInfoColumn } from '@/components/media/MediaInfoColumn';
import { MediaBackdrop } from '@/components/media/MediaHeroArt';
import '@/components/media/media-detail.css';
import { mediaSummary } from '@/utils/mediaSummary';
import { catalogSeasons } from '@/utils/seriesCatalog';
import { hasRequestableSeasons } from '@/utils/seasonFill';
import SeasonExplorer from '@/components/media/SeasonExplorer';
import MediaDetailLoading from '@/components/media/MediaDetailLoading';
import MediaBackButton from '@/components/media/MediaBackButton';
import { useDragScroll } from '@/hooks/useDragScroll';
import { useMediaStatus, getStatusForMedia } from '@/hooks/useMediaStatus';
import type { TmdbMedia } from '@/types';

const NO_RECOMMENDATIONS: TmdbMedia[] = [];

interface Props {
  type: 'movie' | 'tv';
  /** Public share link: the title id comes from the share, not the URL. */
  shareId?: string;
  shareToken?: string;
  /** Share links are view-only: no requests, no season explorer (it needs an account). */
  readOnly?: boolean;
}

export default function MediaDetailPage({ type, shareId, shareToken, readOnly }: Readonly<Props>) {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = shareId ?? params.id;
  const exclusion = useMediaExclusion(type, Number(id) || null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isNsfw, disableBlur } = useNsfwFilter();
  const [revealed, setRevealed] = useState(false);
  const [showNsfwModal, setShowNsfwModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLinkSeriesModal, setShowLinkSeriesModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);

  const {
    media, dbMedia, inLibrary, recommendations,
    loading, libraryLoading, qualityOptions, activeQualityOptionIds,
    audioLanguages, subtitleLanguages, download, blacklisted, refreshDbData,
    catalog, seasonsLoading, seasonsError, refreshMetadata,
  } = useMediaDetailData(id, type, shareToken);
  const recommendationStatuses = useMediaStatus(readOnly ? NO_RECOMMENDATIONS : recommendations);
  const libraryRecommendations = recommendations.filter(item => getStatusForMedia(recommendationStatuses, item.id, item.media_type || (item.title ? 'movie' : 'tv'))?.statusCategory === 'AVAILABLE');
  const seasons = seasonsLoading || seasonsError ? [] : catalogSeasons(media?.seasons, catalog);
  const refreshDetail = useCallback(async () => { refreshMetadata(); await refreshDbData(); }, [refreshDbData, refreshMetadata]);

  useEffect(() => {
    if (loading || (media && String(media.id) !== id)) return;
    // Don't steal focus if the person used the header while waiting for the fetch.
    if (document.activeElement === document.body || document.activeElement?.id === 'media-detail-loading') {
      document.getElementById('media-title')?.focus({ preventScroll: true });
    }
  }, [loading, media, id, type]);

  const {
    requesting, justRequested, requestError,
    selectedQuality, setSelectedQuality,
    selectedCriteria, setSelectedCriteria,
    searchMissingState, searchMissingError,
    handleRequest, handleSearchMissing,
    resetOnNavigation,
  } = useMediaRequestActions(media, id, type, refreshDetail);

  // Reset local UI state on navigation
  useEffect(() => {
    setRevealed(false);
    setShowNsfwModal(false);
    resetOnNavigation();
  }, [id, type]);

  const { isAvailable, takenQualityIds, userHasRequest, buttonState } = useMediaAvailability({
    dbMedia,
    type,
    inLibrary,
    isDownloading: !!download,
    blacklisted: blacklisted?.blocked ?? false,
    activeQualityOptionIds,
    selectedQuality,
    searchMissingState,
    hasRequestableSeasons: type === 'tv' && !!catalog && (catalog.stale || hasRequestableSeasons(seasons)),
    currentUserId: user?.id,
  });

  if (loading) {
    return <MediaDetailLoading />;
  }

  if (!media) {
    return (
      <div className="min-h-dvh flex items-center justify-center" role="status">
        <p className="text-ndp-text-muted">{t('media.not_found')}</p>
      </div>
    );
  }

  const nsfw = !revealed && isNsfw(media.id);

  const { title, year, genres, trailer, cast, director } = mediaSummary(media);
  const showExplorer = type === 'tv' && !readOnly;

  return (
    <div className="min-h-dvh">
      <section className="media-detail-hero" aria-labelledby="media-title">
        <MediaBackdrop backdropPath={media.backdrop_path} posterPath={media.poster_path} blurred={nsfw} />
        {!readOnly && <MediaBackButton />}

        <div className="media-detail-container relative z-10">
          <div className="media-detail-copy">
            {nsfw && (
              <button onClick={() => setShowNsfwModal(true)} className="btn-secondary inline-flex items-center gap-2 mb-6">
                <EyeOff className="w-4 h-4" />
                {t('nsfw.modal.show_once')}
              </button>
            )}
            <MediaInfoColumn
              excludedBy={exclusion?.excluded && !exclusion.inLibrary ? exclusion.service : null}
              onReportIssue={() => setShowIssueModal(true)}
              onBrowseSeasons={showExplorer && seasons.length > 0 ? () => {
                const section = document.getElementById('season-explorer');
                section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
                section?.focus({ preventScroll: true });
              } : undefined}
              media={type === 'tv' ? { ...media, number_of_seasons: seasons.length || media.number_of_seasons || undefined } : media}
              dbMedia={dbMedia}
              type={type}
              title={title}
              year={year}
              genres={genres}
              director={director}
              trailer={trailer}
              isAvailable={isAvailable}
              userHasRequest={userHasRequest}
              buttonState={buttonState}
              requesting={requesting}
              justRequested={justRequested}
              requestError={requestError}
              download={download ? { progress: download.progress, timeLeft: download.timeLeft } : null}
              blacklisted={blacklisted}
              searchMissingError={searchMissingError}
              onRequest={handleRequest}
              onSearchMissing={handleSearchMissing}
              onDeleteMedia={() => setShowDeleteModal(true)}
              onLinkSeries={() => setShowLinkSeriesModal(true)}
              onAddToArr={async () => {
                try {
                  await api.post(`/media/${media.id}/add-to-arr`);
                  await refreshDetail();
                } catch (err) {
                  toastApiError(err, t('media.zurg_add_failed', 'Could not add it to Radarr/Sonarr'));
                }
              }}
              qualityOptions={qualityOptions}
              takenQualityIds={takenQualityIds}
              selectedQuality={selectedQuality}
              selectedCriteria={selectedCriteria}
              setSelectedCriteria={setSelectedCriteria}
              setSelectedQuality={setSelectedQuality}
              audioLanguages={audioLanguages}
              subtitleLanguages={subtitleLanguages}
              libraryLoading={libraryLoading}
              readOnly={readOnly}
            />
          </div>
        </div>
      </section>

      {showExplorer && (
        <div className="media-detail-container relative">
          {seasonsLoading ? <p className="py-8 text-ndp-text-muted" role="status">{t('common.loading')}</p>
            : seasonsError ? <div className="py-8 flex items-center gap-3"><p role="status">{t('media.explorer.unavailable')}</p><button className="btn-secondary" onClick={refreshMetadata}>{t('media.explorer.refresh')}</button></div>
            : seasons.length > 0 && <SeasonExplorer key={`${media.id}:${catalog?.source.token ?? 'tmdb'}`} media={media} seasons={seasons}
            catalog={catalog} requests={dbMedia?.requests ?? []}
            qualityOptions={qualityOptions} activeQualityOptionIds={activeQualityOptionIds}
            blocked={blacklisted.blocked} blurred={nsfw} onRefresh={refreshDetail} />}
        </div>
      )}

      <div className="media-detail-container relative pb-16">
        {/* Collection */}
        {type === 'movie' && media.belongs_to_collection && (
          <CollectionSection collection={media.belongs_to_collection} />
        )}

        {/* Cast */}
        {cast.length > 0 && (
          <CastSection cast={cast} title={t('media.casting')} director={director} />
        )}

        {!readOnly && libraryRecommendations.length > 0 && <div className="mt-12 -mx-4 sm:-mx-8">
          <MediaRow title={t('media.more_like_library', 'More like this from your library')} media={libraryRecommendations} size="large" />
        </div>}

        {/* Recommendations */}
        {recommendations.length > 0 && !readOnly && (
          <div className="mt-12 -mx-4 sm:-mx-8">
            <MediaRow title={t('media.recommendations')} media={recommendations} size="large" />
          </div>
        )}
      </div>

      {showNsfwModal && (
        <NsfwRevealModal
          contentRating={dbMedia?.contentRating || ''}
          onRevealOnce={() => { setRevealed(true); setShowNsfwModal(false); }}
          onRevealAlways={() => { disableBlur(); setShowNsfwModal(false); }}
          onClose={() => setShowNsfwModal(false)}
        />
      )}
      {showIssueModal && media && (
        <ReportIssueModal
          open
          onClose={() => setShowIssueModal(false)}
          tmdbId={Number(id)}
          mediaType={type}
          title={title}
        />
      )}
      {showLinkSeriesModal && (
        <LinkSeriesModal
          tmdbId={Number(id)}
          title={title}
          currentTvdbId={dbMedia?.tvdbId ?? null}
          linkedManually={!!dbMedia?.tvdbLinkedAt}
          onClose={() => setShowLinkSeriesModal(false)}
          onChanged={() => { void refreshDetail(); }}
        />
      )}
      {showDeleteModal && (
        <DeleteMediaModal
          title={title}
          mediaType={type}
          tmdbId={Number(id)}
          onClose={() => setShowDeleteModal(false)}
          zurgSource={dbMedia?.source === 'zurg' && !dbMedia?.radarrId && !dbMedia?.sonarrId}
          onDeleted={() => {
            setShowDeleteModal(false);
            // Back to the list they came from (Missing page keeps its sort in the URL), not home.
            const canGoBack = (window.history.state?.idx ?? 0) > 0;
            if (canGoBack) navigate(-1);
            else navigate('/', { replace: true });
          }}
        />
      )}
    </div>
  );
}

// ─── Cast Section ───────────────────────────────────────────────────

/** Round portraits (0.10 design). Drag to scroll with a mouse; LeMedia's round arrows only on
 *  devices with a mouse and only when there is more to scroll (no full-height edge bands). */
function CastSection({ cast, title, director }: Readonly<{ cast: TmdbCast[]; title: string; director?: TmdbCrew }>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useDragScroll(scrollRef, cast.length);

  return (
    <div className="mt-12">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-ndp-text">{title}</h2>
        {director && (
          <Link to={`/person/${director.id}`} className="flex items-center gap-1.5 text-sm text-ndp-text-muted hover:text-ndp-accent transition-colors">
            <span className="text-ndp-text-dim">·</span>
            <Clapperboard className="w-3.5 h-3.5" />
            <span className="font-medium">{director.name}</span>
          </Link>
        )}
      </div>

      <div className="relative group/arrows">
        {/* Arrows on the portraits (120px circles). */}
        <ScrollArrows target={scrollRef} top="60px" />
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto snap-x snap-proximity scroll-px-4 sm:scroll-px-0 -mx-4 px-4 sm:mx-0 sm:px-0 pb-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {cast.map((person, i) => (
            <Link
              to={`/person/${person.id}`}
              key={person.id}
              className="flex-shrink-0 w-[104px] sm:w-[120px] snap-start group/card"
              style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
            >
              <div className="relative aspect-square rounded-full overflow-hidden bg-ndp-surface-light ring-1 ring-white/10">
                {person.profile_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                    alt={person.name}
                    className="w-full h-full object-cover object-[center_20%] transition-transform duration-300 group-hover/card:scale-105"
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-ndp-surface-light to-ndp-bg">
                    <User className="w-10 h-10 text-ndp-text-dim/30" />
                  </div>
                )}
              </div>
              <div className="pt-3 px-1 text-center">
                <p className="text-xs font-semibold text-ndp-text leading-snug line-clamp-2">{person.name}</p>
                {person.character && (
                  <p className="text-[11px] text-ndp-text-muted leading-snug mt-1 line-clamp-2">{person.character}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
