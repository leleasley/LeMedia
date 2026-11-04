import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

/** Previous / next buttons for a horizontal scroller. Round buttons over the content (no
 *  full-height bands, which showed as boxes over the first and last cards), only on devices with
 *  a mouse (touch screens swipe), and each only when there is more to scroll that way.
 *  The parent must be `relative` and `group/arrows` (a named group, so the cards' own hover styles don't fire for the whole row). `top` positions them on the artwork. */
export function ScrollArrows({ target, top = '50%' }: Readonly<{ target: RefObject<HTMLDivElement | null>; top?: string }>) {
  const { t } = useTranslation();
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = target.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, [target]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [target, update]);

  const scroll = (dir: -1 | 1) => {
    const el = target.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const base = 'absolute z-20 -translate-y-1/2 w-10 h-10 rounded-full items-center justify-center bg-black/65 backdrop-blur-sm ring-1 ring-white/15 text-white shadow-lg transition-opacity duration-200 hover:bg-black/80 focus-visible:opacity-100 hidden [@media(hover:hover)]:flex';
  return (
    <>
      <button type="button" aria-label={t('common.previous', 'Previous')} onClick={() => scroll(-1)} style={{ top }}
        className={clsx(base, 'left-2', edges.left ? 'opacity-0 group-hover/arrows:opacity-100' : '!hidden')}>
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button type="button" aria-label={t('common.next', 'Next')} onClick={() => scroll(1)} style={{ top }}
        className={clsx(base, 'right-2', edges.right ? 'opacity-0 group-hover/arrows:opacity-100' : '!hidden')}>
        <ChevronRight className="w-5 h-5" />
      </button>
    </>
  );
}
