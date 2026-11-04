import { useEffect, useRef, useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api, { backdropUrl } from '@/lib/api';
import { useDragScroll } from '@/hooks/useDragScroll';

export interface GenreItem {
  id: number;
  nameKey: string;
  mediaType: 'movie' | 'tv';
}

// Deduplicated genre list - one card per genre name
// Genres shared by movie & TV use the movie ID (TMDB discover works with both)
export const ALL_GENRES: GenreItem[] = [
  { id: 28, nameKey: 'genre.action', mediaType: 'movie' },
  { id: 12, nameKey: 'genre.adventure', mediaType: 'movie' },
  { id: 16, nameKey: 'genre.animation', mediaType: 'movie' },
  { id: 35, nameKey: 'genre.comedy', mediaType: 'movie' },
  { id: 80, nameKey: 'genre.crime', mediaType: 'movie' },
  { id: 99, nameKey: 'genre.documentary', mediaType: 'movie' },
  { id: 18, nameKey: 'genre.drama', mediaType: 'movie' },
  { id: 10751, nameKey: 'genre.family', mediaType: 'movie' },
  { id: 14, nameKey: 'genre.fantasy', mediaType: 'movie' },
  { id: 36, nameKey: 'genre.history', mediaType: 'movie' },
  { id: 27, nameKey: 'genre.horror', mediaType: 'movie' },
  { id: 10402, nameKey: 'genre.music', mediaType: 'movie' },
  { id: 9648, nameKey: 'genre.mystery', mediaType: 'movie' },
  { id: 10749, nameKey: 'genre.romance', mediaType: 'movie' },
  { id: 878, nameKey: 'genre.science_fiction', mediaType: 'movie' },
  { id: 53, nameKey: 'genre.thriller', mediaType: 'movie' },
  { id: 10752, nameKey: 'genre.war', mediaType: 'movie' },
  { id: 37, nameKey: 'genre.western', mediaType: 'movie' },
];

function GenreRow() {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  useDragScroll(scrollRef, ALL_GENRES.length);
  const [backdrops, setBackdrops] = useState<Record<number, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    api.get<Record<number, string | null>>('/tmdb/genre-backdrops')
      .then(({ data }) => {
        if (cancelled) return;
        setBackdrops(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
      <h2 className="font-display-title text-[26px] sm:text-[30px] text-ndp-text mb-3 px-4 sm:px-8">{t('genre.title')}</h2>

      <div className="relative">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-ndp-bg to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-ndp-bg to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>

        <div
          ref={scrollRef}
          className="edge-fade-x flex gap-3 overflow-x-auto snap-x snap-proximity scroll-px-4 sm:scroll-px-8 px-4 sm:px-8 py-12 -my-12"
          style={{ scrollbarWidth: 'none' }}
        >
          {ALL_GENRES.map((genre) => {
            const bdPath = backdrops[genre.id];
            return (
              <Link
                key={genre.id}
                to={`/discover/${genre.mediaType}/genre/${genre.id}`}
                className="flex-shrink-0 snap-start group/card"
              >
                <div className="poster-frame w-[180px] sm:w-[220px] h-[100px] sm:h-[124px] group-hover/card:scale-[1.03] group-active/card:scale-[0.97]">
                  {bdPath && (
                    <img
                      src={backdropUrl(bdPath, 'w780')}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover/card:opacity-90 transition-opacity duration-300"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <span className="absolute left-3 bottom-2 font-display-title text-[22px] sm:text-2xl text-white">
                    {t(genre.nameKey)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default memo(GenreRow);
