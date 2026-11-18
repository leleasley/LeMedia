import { clsx } from 'clsx';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<Size, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-[3px]',
  lg: 'w-8 h-8 border-4',
  xl: 'w-12 h-12 border-4',
};

/**
 * The one loading indicator: the same red ring as the full-page loader, so a page, a panel and a
 * list footer all spin the same way. Pass `className` for colour overrides (a white ring on a
 * filled accent button, for example).
 */
export function Spinner({ size = 'md', className, label }: Readonly<{ size?: Size; className?: string; label?: string }>) {
  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      className={clsx('inline-block shrink-0 rounded-full border-ndp-accent/30 border-t-ndp-accent animate-spin', SIZES[size], className)}
    />
  );
}
