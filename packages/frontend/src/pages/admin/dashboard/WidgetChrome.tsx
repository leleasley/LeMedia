import type { ReactNode } from 'react';
import { Component as ReactComponent } from 'react';
import { GripVertical, Pencil, X } from 'lucide-react';
import { DynamicIcon } from '@/plugins/DynamicIcon';

interface WidgetChromeProps {
  title: string;
  editMode: boolean;
  headerTitle?: string;
  headerIcon?: string;
  onRemove?: () => void;
  onEdit?: () => void;
  children: ReactNode;
}

class WidgetErrorBoundary extends ReactComponent<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn('[Widget] render error:', err.message); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card flex h-full items-center justify-center p-4 text-sm text-ndp-text-dim">
          Widget error
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetChrome({ title, editMode, headerTitle, headerIcon, onRemove, onEdit, children }: Readonly<WidgetChromeProps>) {
  const hasHeader = !!headerTitle || !!headerIcon;
  return (
    <div className={`relative h-full flex flex-col ${hasHeader ? 'card overflow-hidden' : ''}`}>
      {hasHeader && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[13px] font-semibold text-ndp-text">
          {headerIcon && <DynamicIcon name={headerIcon} className="h-4 w-4 flex-shrink-0 text-ndp-text-dim" />}
          {headerTitle && <span className="truncate">{headerTitle}</span>}
        </div>
      )}
      <div className={`min-h-0 flex-1 ${hasHeader ? '[&>.card]:bg-transparent [&>.card]:border-0 [&>.card]:shadow-none [&>.card]:h-full' : ''}`}>
        <WidgetErrorBoundary>{children}</WidgetErrorBoundary>
      </div>
      {editMode && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-xl outline outline-1 outline-dashed outline-offset-2 outline-white/20" />
          <span
            className="widget-drag-handle absolute top-1.5 left-1.5 z-10 inline-flex h-10 w-10 sm:h-8 sm:w-8 cursor-move touch-none items-center justify-center rounded-lg bg-ndp-bg/90 ring-1 ring-inset ring-white/10 text-ndp-text-dim hover:text-ndp-text"
            title={`Drag ${title}`}
            aria-label={`Drag ${title}`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
            {onEdit && (
              <button
                onClick={onEdit}
                className="inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-ndp-bg/90 ring-1 ring-inset ring-white/10 text-ndp-text-dim hover:bg-ndp-surface-light hover:text-ndp-text"
                title="Edit widget"
                aria-label={`Edit ${title}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onRemove && (
              <button
                onClick={onRemove}
                className="inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-ndp-bg/90 ring-1 ring-inset ring-white/10 text-ndp-text-dim hover:bg-ndp-danger hover:text-white"
                title={`Remove ${title}`}
                aria-label={`Remove ${title}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
