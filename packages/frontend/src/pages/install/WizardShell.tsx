import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';

export interface WizardStep {
  label: string;
  hint?: string;
}

interface WizardShellProps {
  steps: WizardStep[];
  currentStep: number;
  banner?: ReactNode;
  brandTagline?: string;
  children: ReactNode;
}

export function WizardShell({ steps, currentStep, banner, brandTagline, children }: Readonly<WizardShellProps>) {
  return (
    <div className="min-h-dvh bg-ndp-bg flex flex-col lg:grid lg:grid-cols-[420px_1fr_420px] relative overflow-hidden">
      {/* Ambient accent glow, soft halos anchored top-left that bleed across both panels.
       *  Lifted out of the brand `<aside>` so the blur isn't clipped at its boundary. */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-ndp-accent/10 blur-3xl z-0" />
      <div aria-hidden className="pointer-events-none absolute top-32 -left-20 w-[28rem] h-[28rem] rounded-full bg-purple-500/8 blur-3xl z-0" />

      {/* ── Brand panel (left on desktop, top on mobile) ───────────────── */}
      <aside className="relative z-10 flex-shrink-0 lg:col-start-1 flex flex-col border-b lg:border-b-0 border-white/5">
        <div className="relative px-8 pt-10 pb-6 lg:pt-16">
          <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-[0.3em] text-ndp-text leading-none">
            LeMedia
          </h1>
          {brandTagline && (
            <p className="mt-3 text-[11px] font-mono uppercase tracking-[0.25em] text-ndp-text-dim">
              {brandTagline}
            </p>
          )}
        </div>

        <nav className="relative flex-1 px-8 pb-10 hidden lg:block">
          <VerticalStepper steps={steps} currentStep={currentStep} />
        </nav>

        {/* Compact horizontal stepper on mobile */}
        <div className="relative px-6 pb-4 lg:hidden">
          <HorizontalStepper steps={steps} currentStep={currentStep} />
        </div>
      </aside>

      {/* ── Form panel (middle column on desktop, full width on mobile) ── */}
      <main className="relative z-10 lg:col-start-2 flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-xl">
          {banner && <div className="mb-5">{banner}</div>}
          {children}
        </div>
      </main>

      {/* Mirror spacer on the right so the middle column stays viewport-centered. */}
      <div className="hidden lg:block lg:col-start-3" aria-hidden />
    </div>
  );
}

interface StepperProps {
  steps: WizardStep[];
  currentStep: number;
}

function VerticalStepper({ steps, currentStep }: Readonly<StepperProps>) {
  return (
    <ol className="relative">
      {steps.map((step, idx) => {
        const isDone = idx < currentStep;
        const isActive = idx === currentStep;
        const isLast = idx === steps.length - 1;
        return (
          <li key={idx} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && (
              <div
                aria-hidden
                className={clsx(
                  'absolute left-[13px] top-7 bottom-0 w-px transition-colors',
                  isDone ? 'bg-ndp-success/40' : 'bg-white/5',
                )}
              />
            )}
            <span
              aria-current={isActive ? 'step' : undefined}
              className={clsx(
                'flex items-center justify-center rounded-full w-7 h-7 text-[11px] font-semibold flex-shrink-0 transition-all',
                isActive
                  ? 'bg-ndp-accent text-white ring-2 ring-ndp-accent/30'
                  : isDone
                    ? 'bg-ndp-success/15 text-ndp-success'
                    : 'bg-white/5 text-ndp-text-dim',
              )}
            >
              {isDone ? <Check className="w-3.5 h-3.5" /> : idx + 1}
            </span>
            <div className="flex-1 min-w-0 pt-1">
              <p
                className={clsx(
                  'text-sm font-medium leading-tight',
                  isActive ? 'text-ndp-text' : isDone ? 'text-ndp-text-muted' : 'text-ndp-text-dim',
                )}
              >
                {step.label}
              </p>
              {isActive && step.hint && (
                <p className="text-xs text-ndp-text-dim mt-0.5 leading-snug">{step.hint}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HorizontalStepper({ steps, currentStep }: Readonly<StepperProps>) {
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((step, idx) => {
        const isDone = idx < currentStep;
        const isActive = idx === currentStep;
        return (
          <li key={idx} className={clsx('h-1 rounded-full transition-all', isActive ? 'flex-1 bg-ndp-accent' : isDone ? 'flex-1 bg-ndp-success/40' : 'w-3 bg-white/10')}>
            <span className="sr-only">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
