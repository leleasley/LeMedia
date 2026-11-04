import { useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useWatchProviders } from '@/hooks/useWatchProviders';

/** Curated streaming row — TMDB's raw regional catalogue (~140 providers) is mostly noise:
 *  meta-search (JustWatch), rental stores, duplicate "* Amazon Channel" variants and
 *  single-audience niches. This is the deliberate shortlist, in display order.
 *  It is a frontend concern on purpose: the admin homepage query builder still needs the
 *  full provider list, so the backend keeps returning everything.
 *  Codes are TMDB provider ids — add/remove ids here to re-curate. */
const CURATED_PROVIDER_IDS: readonly number[] = [
  8,    // Netflix
  9,    // Amazon Prime Video
  350,  // Apple TV
  337,  // Disney+
  39,   // NOW
  29,   // Sky Go
  11,   // MUBI
  99,   // Shudder
  38,   // BBC iPlayer
  41,   // ITVX
  103,  // Channel 4
  137,  // UKTV Play
  300,  // Pluto TV
  524,  // Discovery+
  283,  // Crunchyroll
  73,   // Tubi TV
  189,  // Curzon Home Cinema
  223,  // Hayu
  333,  // 5
  593,  // STV Player
];

/** Streaming-service logo row — the Seerr-style entry point. Each logo opens a full
 *  provider results page (/discover/:mediaType/provider/:id), not a homepage carousel. */
function StreamingRow() {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { providers } = useWatchProviders();

  // Curated order wins over the server's priority order, and ids TMDB doesn't offer in this
  // region are dropped rather than rendered as a gap.
  const byId = new Map(providers.map((p) => [p.provider_id, p]));
  const ordered = CURATED_PROVIDER_IDS
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  if (ordered.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="relative group/row">
      <h2 className="font-display-title text-[26px] sm:text-[30px] text-ndp-text mb-3 px-4 sm:px-8">{t('home.streaming')}</h2>

      <div className="relative">
        <button
          onClick={() => scroll('left')}
          aria-label={t('common.previous', 'Previous')}
          className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-ndp-bg to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => scroll('right')}
          aria-label={t('common.next', 'Next')}
          className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-ndp-bg to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto px-4 sm:px-8 py-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {ordered.map((p) => (
            <Link
              key={p.provider_id}
              to={`/discover/movie/provider/${p.provider_id}`}
              title={p.provider_name}
              aria-label={p.provider_name}
              className="flex-shrink-0 group/card"
            >
              <div className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-2xl overflow-hidden bg-white/[0.06] ring-1 ring-white/10 will-change-transform transition-[transform,box-shadow] duration-300 hover:scale-105 hover:shadow-xl hover:ring-white/25">
                {p.logo_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w185${p.logo_path}`}
                    alt={p.provider_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center px-1">
                    <span className="text-[10px] font-bold text-ndp-text text-center leading-tight">
                      {p.provider_name}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default memo(StreamingRow);
