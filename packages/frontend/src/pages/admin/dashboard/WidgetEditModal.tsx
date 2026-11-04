import { useState } from 'react';
import { X } from 'lucide-react';
import { useModal } from '@/hooks/useModal';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { IconPicker } from './IconPicker';
import type { LayoutItem } from './useDashboardLayout';

interface Props {
  item: LayoutItem;
  defaultTitle: string;
  onSave: (next: Pick<LayoutItem, 'customTitle' | 'customIcon' | 'showTitle'>) => void;
  onClose: () => void;
}

export function WidgetEditModal({ item, defaultTitle, onSave, onClose }: Readonly<Props>) {
  const { dialogRef, titleId } = useModal({ open: true, onClose });
  const [title, setTitle] = useState(item.customTitle ?? '');
  const [icon, setIcon] = useState<string | undefined>(item.customIcon);
  const [showTitle, setShowTitle] = useState(item.showTitle ?? false);

  const submit = () => {
    onSave({
      customTitle: title.trim() || undefined,
      customIcon: icon,
      showTitle: showTitle || undefined,
    });
    onClose();
  };

  const reset = () => {
    setTitle('');
    setIcon(undefined);
    setShowTitle(false);
  };

  return (
    <div
      className="modal-overlay z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel w-full max-w-md"
      >
        <div className="flex items-center justify-between gap-4 pl-5 pr-3 sm:pl-6 pt-4 pb-2 sm:pt-5">
          <h2 id={titleId} className="text-base font-semibold text-ndp-text">Customize widget</h2>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-2 space-y-5">
          <div>
            <label className="block text-xs font-medium text-ndp-text-muted">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle}
              maxLength={80}
              className="input w-full py-2.5 text-sm mt-1.5"
            />
            <p className="text-xs text-ndp-text-dim mt-1.5">Leave empty to use the widget's default title.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ndp-text-muted">Icon</label>
            <div className="mt-1.5">
              <IconPicker
                value={icon}
                onChange={setIcon}
                trigger={
                  <button className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/[0.08] bg-ndp-surface-light px-3 py-2 text-sm text-ndp-text hover:bg-ndp-surface-hover">
                    {icon ? <DynamicIcon name={icon} className="h-4 w-4" /> : <span className="text-ndp-text-dim">No icon</span>}
                    {icon && <span className="text-xs text-ndp-text-dim">{icon}</span>}
                  </button>
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-lg bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] px-3 py-3 text-sm text-ndp-text cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showTitle}
              onChange={(e) => setShowTitle(e.target.checked)}
              className="h-4 w-4 flex-shrink-0 rounded border-white/10 bg-ndp-surface-light accent-ndp-accent text-ndp-accent focus:ring-ndp-accent/50"
            />
            Show header bar even without a custom title
          </label>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={reset}
              className="min-h-[40px] rounded-lg px-3 py-2 text-sm font-medium text-ndp-text-dim hover:bg-white/5 hover:text-ndp-text transition-colors"
            >
              Use defaults
            </button>
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="btn-secondary text-sm px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className="btn-primary text-sm px-4 py-2"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
