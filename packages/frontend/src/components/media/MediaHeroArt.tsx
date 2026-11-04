import { clsx } from 'clsx';
import { EyeOff } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { posterUrl, backdropUrl } from '@/lib/api';

/** Full-screen artwork fixed behind the page (and the header), blended into the page colour.
 *  On wide screens it sits in the right-hand area. Scrolling fades it to the background, written
 *  straight to the DOM so scrolling never re-renders the page. */
export function MediaBackdrop({ backdropPath, posterPath, blurred }: Readonly<{
  backdropPath?: string | null;
  posterPath?: string | null;
  blurred: boolean;
}>) {
  const veilId = useId();
  const fadeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => {
      const opacity = Math.min(1, Math.max(0, (window.scrollY - 70) / 305));
      if (fadeRef.current) fadeRef.current.style.opacity = String(opacity);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className="media-detail-art" aria-hidden="true">
      {(backdropPath || posterPath) && (
        <div className="media-detail-image">
          <img
            src={backdropPath ? backdropUrl(backdropPath) : posterUrl(posterPath ?? null)}
            alt=""
            className={clsx('w-full h-full object-center', backdropPath ? 'object-cover' : 'object-contain', blurred && 'blur-3xl scale-110')}
          />
          <svg className="media-detail-veil" viewBox="0 0 1200 900" preserveAspectRatio="none" focusable="false">
            <defs>
              <filter id={veilId} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
                <feGaussianBlur stdDeviation="96" />
              </filter>
            </defs>
            {/* Overlapping, feathered contours keep the artwork open without a visible circular edge. */}
            <g fill="currentColor" filter={`url(#${veilId})`}>
              <path d="M-260-240H90C180 80 160 210 330 340S390 505 520 620S730 755 800 1140H-260Z" />
              <path fillOpacity=".6" d="M-260-180H-30C80 80 80 280 280 430S330 610 520 740S660 960 650 1140H-260Z" />
              <path fillOpacity=".94" d="M-200 660C40 580 155 760 410 740S690 655 850 775S1095 740 1400 850V1160H-200Z" />
              <path fillOpacity=".28" d="M-200-220H1400V-30C1060 85 900-40 650 25S240-15-200 100Z" />
            </g>
          </svg>
          <div className="media-detail-shade" />
        </div>
      )}
      <div ref={fadeRef} className="media-detail-fade" style={{ opacity: 0 }} />
      {/* Colour bleed: a heavily blurred copy stays faintly visible after the fade, so the page
          keeps the title's palette instead of going flat black. */}
      {backdropPath && !blurred && (
        <img src={backdropUrl(backdropPath, 'w300')} alt="" className="media-detail-bleed" />
      )}
    </div>
  );
}

/** Poster, blurred behind a reveal affordance when the title is flagged mature. */
export function MediaPoster({ posterPath, title, blurred, revealLabel, onReveal }: Readonly<{
  posterPath: string | null;
  title: string;
  blurred: boolean;
  revealLabel: string;
  onReveal: () => void;
}>) {
  return (
    <div className="flex-shrink-0 w-40 sm:w-56 mx-auto md:mx-0">
      <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10 relative bg-ndp-surface-light">
        <img
          src={posterUrl(posterPath)}
          alt={title}
          className={clsx('w-full h-full object-cover', blurred && 'blur-xl scale-110')}
        />
        {blurred && (
          <button
            onClick={onReveal}
            aria-label={revealLabel}
            className="absolute inset-0 flex items-center justify-center cursor-pointer group/nsfw"
          >
            <div className="p-3 rounded-full bg-black/30 backdrop-blur-sm shadow-lg shadow-black/30 group-hover/nsfw:bg-black/50 transition-colors">
              <EyeOff className="w-6 h-6 text-white/80 group-hover/nsfw:text-white transition-colors" />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
