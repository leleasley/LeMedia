import type { ReactNode } from 'react';

interface AdminTabLayoutProps {
  /** Tab-level title. Omit when the group header (AdminPage) already names the page — avoids
   *  "Plugins / Plugins" double-title on single-tab groups. Actions remain rendered either way. */
  title?: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminTabLayout({ title, count, actions, children }: Readonly<AdminTabLayoutProps>) {
  const showHeader = !!title || !!actions;
  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 min-h-[40px]">
          {/* On desktop the admin page header already names the page; keep only the count. */}
          {title ? (
            <h2 className="font-display-title text-3xl text-ndp-text min-w-0 md:hidden">
              {title}{count !== undefined && ` (${count})`}
            </h2>
          ) : null}
          {title && count !== undefined && (
            <p className="hidden md:block text-sm text-ndp-text-muted tabular-nums">{count}</p>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2 ml-auto">{actions}</div>}
        </div>
      )}
      <div className="animate-fade-in pb-20">
        {children}
      </div>
    </div>
  );
}
