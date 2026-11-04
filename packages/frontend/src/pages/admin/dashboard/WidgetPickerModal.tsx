import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { usePluginUI } from '@/plugins/usePlugins';
import { useModal } from '@/hooks/useModal';
import { BUILT_IN_WIDGETS } from './builtInCatalog';

interface PickerEntry {
  layoutI: string;            // e.g. 'builtin:stats-counters' or 'plugin:tautulli:weekly-stats'
  source: 'built-in' | 'plugin';
  title: string;
  icon?: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (entry: PickerEntry) => void;
  alreadyOnDashboard: Set<string>;   // set of layout 'i'
}

type Filter = 'all' | 'built-in' | 'plugin';

export function WidgetPickerModal({ open, onClose, onPick, alreadyOnDashboard }: Readonly<Props>) {
  const { t } = useTranslation();
  const { contributions } = usePluginUI('admin.dashboard.widget');
  const [filter, setFilter] = useState<Filter>('all');

  // Escape-to-close, focus trap and focus return — the same contract every other modal in the
  // app already honours through this hook.
  const { dialogRef, titleId } = useModal({ open, onClose });

  const entries = useMemo<PickerEntry[]>(() => {
    const builtIn: PickerEntry[] = Object.values(BUILT_IN_WIDGETS).map((w) => ({
      layoutI: `builtin:${w.id}`,
      source: 'built-in',
      title: w.title,
      icon: w.icon,
      defaultSize: w.defaultSize,
      minSize: w.minSize,
    }));
    const plugin: PickerEntry[] = contributions.map((c) => {
      const props = c.props as { id: string; title: string; icon?: string; defaultSize: { w: number; h: number }; minSize?: { w: number; h: number } };
      return {
        layoutI: `plugin:${c.pluginId}:${props.id}`,
        source: 'plugin',
        title: props.title,
        icon: props.icon,
        defaultSize: props.defaultSize,
        minSize: props.minSize,
      };
    });
    return [...builtIn, ...plugin];
  }, [contributions]);

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.source === filter);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay z-50" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-3 pl-5 pr-3 pt-4 pb-2 sm:py-3">
          <h3 id={titleId} className="text-base font-semibold text-ndp-text">{t('admin.dashboard.add_widget')}</h3>
          <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ndp-text-dim hover:bg-white/5 hover:text-ndp-text" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto border-b border-white/[0.06] px-5 pb-3">
          {(['all', 'built-in', 'plugin'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`min-h-[36px] whitespace-nowrap rounded-lg px-3.5 text-xs font-medium transition-colors ${filter === f ? 'bg-ndp-accent text-white' : 'bg-white/5 text-ndp-text-dim hover:text-ndp-text hover:bg-white/[0.08]'}`}
            >
              {t(`admin.dashboard.widget_filter.${f === 'built-in' ? 'built_in' : f}`)}
            </button>
          ))}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 space-y-0.5">
          {filtered.map((e) => {
            const taken = alreadyOnDashboard.has(e.layoutI);
            return (
              <li key={e.layoutI}>
                <button
                  onClick={() => { if (!taken) { onPick(e); onClose(); } }}
                  disabled={taken}
                  className={`flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${taken ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5'}`}
                >
                  {e.icon && <span className="admin-icon-tile"><DynamicIcon name={e.icon} className="h-4 w-4 text-ndp-text-muted" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ndp-text">{e.title}</p>
                    <p className="truncate text-[11px] text-ndp-text-dim">
                      {t(`admin.dashboard.widget_source.${e.source === 'built-in' ? 'built_in' : 'plugin'}`)} · {e.defaultSize.w}×{e.defaultSize.h}
                    </p>
                  </div>
                  {taken && <span className="admin-chip flex-shrink-0">{t('admin.dashboard.widget_already_added')}</span>}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-ndp-text-dim">{t('admin.dashboard.no_widgets')}</li>
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
