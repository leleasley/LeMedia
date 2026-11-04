import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Shared empty state — icon tile, short title, optional hint and action. */
export default function EmptyState({ icon: Icon, title, hint, action }: Readonly<{
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}>) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-xl bg-ndp-surface-light ring-1 ring-inset ring-white/[0.06] flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-ndp-text-muted" strokeWidth={1.75} />
      </div>
      <p className="font-display-title text-2xl text-ndp-text">{title}</p>
      {hint && <p className="text-sm text-ndp-text-dim mt-2 max-w-xs">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
