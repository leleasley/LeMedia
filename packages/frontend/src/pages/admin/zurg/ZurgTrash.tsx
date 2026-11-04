import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Info, Loader2, RotateCcw, Search, Trash2, X } from 'lucide-react';
import api from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';

interface TrashItem { id: string; name: string; size: string; why: string; removed: string; accounts: string; deletedOnService: string }
type Group = 'all' | 'dropped' | 'cleanup' | 'arr' | 'other';
const PAGE = 50;
const KEEP_DAYS = 30;

/** Why a release is in the trash, from zurg's own wording. */
function groupOf(x: TrashItem): Exclude<Group, 'all'> {
  const w = x.why.toLowerCase();
  if (w.includes('gone from every account')) return 'dropped';
  if (w.includes('manage page')) return 'cleanup';
  if (w.includes('allow_delete') || w.includes('__magic__')) return 'arr';
  return 'other';
}

const daysLeft = (removed: string): number | null => {
  const t = Date.parse(removed.replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t + KEEP_DAYS * 86_400_000 - Date.now()) / 86_400_000));
};

/** Zurg's trash: releases taken out of the library, kept 30 days. Grouped by why they left,
 *  so it's clear what's safe to purge and what restoring would do. */
export function ZurgTrash({ onChanged }: Readonly<{ onChanged?: () => void }>) {
  const { t } = useTranslation();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [group, setGroup] = useState<Group>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'purge' | 'purge-group' | 'purge-all' | 'restore'; id?: string; name?: string }>(null);

  const load = useCallback(async (fresh = false) => {
    try { const { data } = await api.get<{ items: TrashItem[] }>(`/admin/zurg/trash${fresh ? '?fresh=1' : ''}`); setItems(data.items); }
    catch (err) { toastApiError(err, t('admin.zurg.trash.load_failed', 'Could not load the trash')); setItems([]); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  const GROUPS: Record<Exclude<Group, 'all'>, { label: string; about: string }> = {
    dropped: {
      label: t('admin.zurg.trash.g_dropped', 'Dropped by TorBox'),
      about: t('admin.zurg.trash.g_dropped_about', 'TorBox removed these from your account on its own, nobody here deleted them, Zurg just filed them away. They\'re usually safe to purge. Restore asks TorBox to add the release back, which only works while TorBox still has it cached.'),
    },
    cleanup: {
      label: t('admin.zurg.trash.g_cleanup', 'Removed by cleanup'),
      about: t('admin.zurg.trash.g_cleanup_about', 'Removed from Zurg\'s manage page, by LeMedia\'s cleanup (unused duplicates, the big file from a swap) or by hand. They were also deleted on TorBox. Restore puts one back if you change your mind.'),
    },
    arr: {
      label: t('admin.zurg.trash.g_arr', 'Deleted by Radarr / Sonarr'),
      about: t('admin.zurg.trash.g_arr_about', 'Radarr or Sonarr deleted the file (an upgrade, a swap, or a removed title), so Zurg removed the release from TorBox too.'),
    },
    other: { label: t('admin.zurg.trash.g_other', 'Other'), about: t('admin.zurg.trash.g_other_about', 'Removed for another reason, see each entry.') },
  };

  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: 0, dropped: 0, cleanup: 0, arr: 0, other: 0 };
    for (const x of items ?? []) { c.all++; c[groupOf(x)]++; }
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((x) => (group === 'all' || groupOf(x) === group) && (!q || x.name.toLowerCase().includes(q)));
  }, [items, query, group]);

  const act = async (id: string, action: 'restore' | 'purge') => {
    setBusy(id);
    try {
      const { data } = await api.post<{ ok: boolean; result: string }>(`/admin/zurg/trash/${id}/${action}`);
      showToast(action === 'restore'
        ? (data.result === 'readded' ? t('admin.zurg.trash.readded', 'Added back to the account, it returns to the library once listed') : t('admin.zurg.trash.restored', 'Restored to the library'))
        : t('admin.zurg.trash.purged', 'Purged'), 'success');
      setItems((list) => (list ?? []).filter((x) => x.id !== id));
      onChanged?.();
    } catch (err) { toastApiError(err, t('admin.zurg.trash.action_failed', 'That didn\'t work, see Zurg\'s log')); }
    finally { setBusy(null); }
  };

  const purgeShown = async () => {
    setBusy('purge-group');
    try {
      const ids = shown.map((x) => x.id);
      const { data } = await api.post<{ purged: number; failed: number }>('/admin/zurg/trash/purge', { ids }, { timeout: 300_000 });
      showToast(t('admin.zurg.trash.purged_n', '{{n}} purged', { n: data.purged }), data.failed ? 'info' : 'success');
      await load(true);
      onChanged?.();
    } catch (err) { toastApiError(err, t('admin.zurg.trash.action_failed', 'That didn\'t work, see Zurg\'s log')); }
    finally { setBusy(null); }
  };

  const purgeAll = async () => {
    setBusy('purge-all');
    try { await api.post('/admin/zurg/trash/purge-all'); setItems([]); onChanged?.(); showToast(t('admin.zurg.trash.emptied', 'Trash emptied'), 'success'); }
    catch (err) { toastApiError(err, t('admin.zurg.trash.action_failed', 'That didn\'t work, see Zurg\'s log')); }
    finally { setBusy(null); }
  };

  if (!items) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-ndp-text-dim" /></div>;
  if (items.length === 0) return <p className="admin-group admin-row text-sm text-ndp-text-dim">{t('admin.zurg.trash.empty', 'The trash is empty.')}</p>;

  const chipGroups: Group[] = ['all', 'dropped', 'cleanup', 'arr', 'other'];

  return (
    <div className="space-y-3">
      {/* Why things are here */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {chipGroups.filter((g) => g === 'all' || counts[g] > 0).map((g) => (
          <button key={g} type="button" onClick={() => { setGroup(g); setLimit(PAGE); }} className={clsx('h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1.5', group === g ? 'bg-ndp-text text-ndp-bg' : 'bg-white/[0.06] text-ndp-text-muted hover:text-ndp-text')}>
            {g === 'all' ? t('admin.zurg.trash.g_all', 'Everything') : GROUPS[g].label}
            <span className={clsx('tabular-nums', group === g ? 'text-ndp-bg/60' : 'text-ndp-text-dim')}>{counts[g]}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-3 rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] px-4 py-3">
        <Info className="w-4 h-4 text-ndp-text-dim flex-shrink-0 mt-0.5" />
        <div className="text-xs text-ndp-text-muted leading-relaxed space-y-1">
          {group === 'all'
            ? (['dropped', 'cleanup', 'arr'] as const).filter((g) => counts[g] > 0).map((g) => (
              <p key={g}><span className="font-semibold text-ndp-text">{GROUPS[g].label} ({counts[g]})</span>, {GROUPS[g].about}</p>
            ))
            : <p>{GROUPS[group].about}</p>}
          <p className="text-ndp-text-dim">{t('admin.zurg.trash.keep_note', 'Zurg forgets each entry for good after 30 days. Purging just does that sooner, it doesn\'t touch TorBox.')}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t('admin.zurg.trash.search', 'Search the trash')} className="input w-full !pl-9 !h-10" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear', 'Clear')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ndp-text-dim hover:text-ndp-text"><X className="w-4 h-4" /></button>}
        </label>
        {group === 'all' && !query ? (
          <button type="button" onClick={() => setConfirm({ kind: 'purge-all' })} disabled={!!busy} className="btn-danger !px-3 !h-10 !py-0 !text-sm flex-shrink-0">
            {t('admin.zurg.trash.empty_all', 'Empty trash')}
          </button>
        ) : shown.length > 0 && (
          <button type="button" onClick={() => setConfirm({ kind: 'purge-group' })} disabled={!!busy} className="btn-danger !px-3 !h-10 !py-0 !text-sm flex-shrink-0 flex items-center gap-1.5">
            {busy === 'purge-group' && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('admin.zurg.trash.purge_n', 'Purge these {{n}}', { n: shown.length })}
          </button>
        )}
      </div>

      <div className="admin-group divide-y divide-white/[0.06]">
        {shown.length === 0 && <p className="admin-row text-sm text-ndp-text-dim">{t('admin.zurg.dup.no_match', 'Nothing matches that search.')}</p>}
        {shown.slice(0, limit).map((x) => {
          const left = daysLeft(x.removed);
          const g = groupOf(x);
          return (
            <div key={x.id} className="admin-row items-start">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ndp-text break-all leading-snug">{x.name}</p>
                <p className="text-xs text-ndp-text-dim mt-0.5 flex flex-wrap gap-x-1.5">
                  <span>{x.size}</span>
                  <span>· {t('admin.zurg.trash.removed_on', 'removed {{when}}', { when: x.removed })}</span>
                  {left !== null && <span className={clsx(left <= 3 && 'text-amber-300/90')}>· {t('admin.zurg.trash.days_left', '{{n}} days left', { n: left })}</span>}
                  {group === 'all' && <span>· {GROUPS[g].label}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" onClick={() => (g === 'dropped' ? setConfirm({ kind: 'restore', id: x.id, name: x.name }) : void act(x.id, 'restore'))} disabled={!!busy} aria-label={t('admin.zurg.trash.restore', 'Restore')} title={t('admin.zurg.trash.restore', 'Restore')} className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-emerald-300 hover:bg-white/5">
                  {busy === x.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => setConfirm({ kind: 'purge', id: x.id, name: x.name })} disabled={!!busy} aria-label={t('admin.zurg.trash.purge', 'Purge')} title={t('admin.zurg.trash.purge', 'Purge')} className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-ndp-danger hover:bg-ndp-danger/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        {shown.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="admin-row w-full justify-center text-sm font-medium text-ndp-accent hover:bg-white/[0.03]">
            {t('admin.zurg.dup.show_more', 'Show more ({{n}} left)', { n: shown.length - limit })}
          </button>
        )}
      </div>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        tone={confirm?.kind === 'restore' ? undefined : 'danger'}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          if (c.kind === 'purge' && c.id) await act(c.id, 'purge');
          else if (c.kind === 'restore' && c.id) await act(c.id, 'restore');
          else if (c.kind === 'purge-group') await purgeShown();
          else if (c.kind === 'purge-all') await purgeAll();
        }}
        title={confirm?.kind === 'purge-all' ? t('admin.zurg.trash.confirm_all_title', 'Empty Zurg\'s trash?')
          : confirm?.kind === 'purge-group' ? t('admin.zurg.trash.confirm_group_title', 'Purge {{n}} entries?', { n: shown.length })
            : confirm?.kind === 'restore' ? t('admin.zurg.trash.confirm_restore_title', 'Ask TorBox for it again?')
              : t('admin.zurg.trash.confirm_title', 'Purge this release?')}
        description={confirm?.kind === 'purge-all' ? t('admin.zurg.trash.confirm_all_desc', 'Every release in the trash is forgotten for good, with its renames and analysis.')
          : confirm?.kind === 'purge-group' ? t('admin.zurg.trash.confirm_group_desc', 'They\'re forgotten for good, Zurg would do the same once their 30 days are up. TorBox isn\'t touched.')
            : confirm?.kind === 'restore' ? t('admin.zurg.trash.confirm_restore_desc', 'TorBox dropped this release itself. Restoring re-adds it to your account, it only comes back if TorBox still has it cached.')
              : (confirm?.name ?? '')}
        confirmLabel={confirm?.kind === 'restore' ? t('admin.zurg.trash.restore', 'Restore') : t('admin.zurg.trash.purge', 'Purge')}
      />
    </div>
  );
}
