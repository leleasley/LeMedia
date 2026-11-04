import { useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import { ScrollArrows } from './ScrollArrows';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import MediaCard, { MediaCardSkeleton } from './MediaCard';
import { useMediaStatus, getStatusForMedia } from '@/hooks/useMediaStatus';
import type { TmdbMedia } from '@/types';
import { useDragScroll } from '@/hooks/useDragScroll';

interface MediaRowProps {
  title: string;
  media: TmdbMedia[];
  loading?: boolean;
  href?: string;
  size?: 'default' | 'large';
}

const SIZE_CLASSES = {
  default: 'w-[140px] sm:w-[160px] lg:w-[180px]',
  large: 'w-[180px] sm:w-[210px] lg:w-[240px]',
};

function MediaRow({ title, media, loading, href, size = 'default' }: Readonly<MediaRowProps>) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  useDragScroll(scrollRef, loading ? 0 : media.length);
  const statuses = useMediaStatus(media);

  return (
    <section className="relative group/row">
      {/* z-10 keeps the header above the scroll container's invisible padding zone
       *  (the row uses py-12 -my-12 to give cards room to scale on hover — without
       *  the z-index the header click target is swallowed by that padding). */}
      <div className="relative z-10 flex items-end justify-between gap-3 mb-3 px-4 sm:px-8">
        <h2 className="font-display-title text-[26px] sm:text-[30px] text-ndp-text">{title}</h2>
        {href && (
          <Link
            to={href}
            className="flex items-center gap-1 pb-0.5 text-sm font-medium text-ndp-text-muted hover:text-ndp-accent transition-colors group/link"
          >
            {t('home.see_all', 'See all')}
            <ArrowRight className="w-4 h-4 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        )}
      </div>

      <div className="relative group/arrows">
        <ScrollArrows target={scrollRef} />

        <div
          ref={scrollRef}
          className="edge-fade-x flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-proximity scroll-px-4 sm:scroll-px-8 px-4 sm:px-8 py-12 -my-12"
          style={{ scrollbarWidth: 'none' }}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <MediaCardSkeleton key={`skel-${i}`} className={SIZE_CLASSES[size]} />
              ))
            : media.map((item, i) => {
                const type = item.media_type || (item.title ? 'movie' : 'tv');
                return (
                  <MediaCard
                    key={`${type}-${item.id}`}
                    media={item}
                    className={SIZE_CLASSES[size]}
                    availability={getStatusForMedia(statuses, item.id, type)}
                    index={i}
                  />
                );
              })}
        </div>
      </div>
    </section>
  );
}

export default memo(MediaRow);
