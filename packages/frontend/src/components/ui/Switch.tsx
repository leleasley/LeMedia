import { clsx } from 'clsx';

type Tone = 'accent' | 'warning';
type Size = 'md' | 'sm';

const TRACK_ON: Record<Tone, string> = {
  accent: 'bg-ndp-accent',
  warning: 'bg-amber-400',
};

/** Visual-only switch track. Use inside an element that is already the clickable control
 *  (e.g. a whole settings row); otherwise use <Switch>. */
export function SwitchTrack({ on, tone = 'accent', size = 'md' }: Readonly<{ on: boolean; tone?: Tone; size?: Size }>) {
  return (
    <span
      aria-hidden
      className={clsx(
        'relative block flex-shrink-0 rounded-full transition-colors',
        size === 'md' ? 'w-11 h-6' : 'w-9 h-5',
        on ? TRACK_ON[tone] : 'bg-white/[0.12]',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 left-0.5 bg-white rounded-full shadow-sm transition-transform',
          size === 'md' ? 'w-5 h-5' : 'w-4 h-4',
          on && (size === 'md' ? 'translate-x-5' : 'translate-x-4'),
        )}
      />
    </span>
  );
}

/** Shared on/off switch — 40px tap target around a 44×24 track, `role="switch"` semantics.
 *  Pass `className="-mr-1.5"` to sit it flush with the right edge of a settings row. */
export default function Switch({ checked, onChange, label, disabled, tone, className }: Readonly<{
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — required unless the switch is labelled by surrounding text via aria-labelledby. */
  label?: string;
  disabled?: boolean;
  tone?: Tone;
  className?: string;
}>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex-shrink-0 h-10 w-14 flex items-center justify-center rounded-lg transition-opacity',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndp-accent/60',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
    >
      <SwitchTrack on={checked} tone={tone} />
    </button>
  );
}
