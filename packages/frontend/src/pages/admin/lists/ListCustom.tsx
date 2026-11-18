import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Eye, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import api, { posterUrl } from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useLiveSearch } from '@/hooks/useLiveSearch';
import { showToast, toastApiError } from '@/utils/toast';
import type { ListItem } from './shared';
import { Spinner } from '@/components/Spinner';

interface CustomList { id: string; name: string; items: ListItem[]; updatedAt: string }

/** Admin → Lists → Handmade: build a list by hand, then preview and add it like any other list. */
export function ListCustom({ onPreview }: Readonly<{ onPreview: (url: string) => void }>) {
  const [lists, setLists] = useState<CustomList[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [del, setDel] = useState<CustomList | null>(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get<CustomList[]>('/admin/lists/custom'); setLists(data); setCurrent((c) => c ?? data[0]?.id ?? null); }
    catch (err) { toastApiError(err, 'Could not load handmade lists'); setLists([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    try {
      const { data } = await api.post<{ id: string }>('/admin/lists/custom', { name: newName });
      setNewName(''); setCurrent(data.id); await load();
    } catch (err) { toastApiError(err, 'Could not create the list'); }
  };

  const list = lists?.find((l) => l.id === current) ?? null;

  if (!lists) return <div className="admin-group admin-row justify-center py-10 text-sm text-ndp-text-dim"><Spinner size="sm" className="mr-2" />Loading…</div>;

  return (
    <div className="space-y-5">
      <div>
        <p className="admin-group-label">Your handmade lists</p>
        <div className="flex flex-wrap gap-2">
          {lists.map((l) => (
            <button key={l.id} type="button" onClick={() => setCurrent(l.id)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm ring-1 ring-inset transition-colors', l.id === current ? 'bg-ndp-accent/15 ring-ndp-accent/40 text-ndp-text' : 'bg-ndp-surface ring-white/[0.06] text-ndp-text-muted hover:text-ndp-text')}>
              {l.name} <span className="text-ndp-text-dim">{l.items.length}</span>
            </button>
          ))}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) void create(); }}>
            <input className="input !py-1.5 w-44" placeholder="New list name" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className="btn-secondary !py-1.5 inline-flex items-center gap-1 text-sm" disabled={!newName.trim()}><Plus className="w-3.5 h-3.5" />Create</button>
          </form>
        </div>
      </div>

      {list && (
        <>
          <TitleSearch listId={list.id} onAdded={load} existing={new Set(list.items.map((i) => `${i.mediaType === 'movie' ? 'movie' : 'tv'}:${i.ids.tmdb ?? ''}`))} />
          <div>
            <div className="flex items-center justify-between gap-3 mb-2 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{list.name}, {list.items.length} title{list.items.length === 1 ? '' : 's'}</p>
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-ndp-accent hover:underline inline-flex items-center gap-1 disabled:opacity-50" disabled={!list.items.length} onClick={() => onPreview(`custom:${list.id}`)}><Eye className="w-3.5 h-3.5" />Preview and add</button>
                <button type="button" className="text-red-300 hover:underline inline-flex items-center gap-1" onClick={() => setDel(list)}><Trash2 className="w-3.5 h-3.5" />Delete list</button>
              </div>
            </div>
            <div className="admin-group divide-y divide-white/[0.06]">
              {list.items.length === 0 && <p className="admin-row text-sm text-ndp-text-dim">Empty. Search above to add titles.</p>}
              {list.items.map((i) => (
                <div key={i.key} className="admin-row !min-h-0 !py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ndp-text truncate">{i.title} {i.year ? <span className="text-ndp-text-dim">({i.year})</span> : null}</p>
                  </div>
                  <span className="admin-chip">{i.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
                  <button type="button" aria-label={`Remove ${i.title}`} className="p-1.5 rounded-lg text-ndp-text-dim hover:text-red-300 hover:bg-white/[0.05]"
                    onClick={async () => {
                      try { await api.delete(`/admin/lists/custom/${list.id}/items`, { data: { key: i.key } }); await load(); }
                      catch (err) { toastApiError(err, 'Could not remove it'); }
                    }}><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <p className="admin-hint">"Preview and add" checks the list against your library and filters, then lets you add it and keep it in sync, so titles you add here later are picked up too.</p>
          </div>
        </>
      )}

      <ConfirmModal open={!!del} title={`Delete ${del?.name ?? 'this list'}?`} tone="danger" confirmLabel="Delete"
        description="The list and its subscription go. Titles already added stay in Radarr and Sonarr."
        onClose={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return;
          try { await api.delete(`/admin/lists/custom/${del.id}`); setCurrent(null); showToast('List deleted', 'success'); await load(); }
          catch (err) { toastApiError(err, 'Could not delete the list'); }
        }} />
    </div>
  );
}

function TitleSearch({ listId, existing, onAdded }: Readonly<{ listId: string; existing: Set<string>; onAdded: () => Promise<void> }>) {
  const [q, setQ] = useState('');
  const { items, loading } = useLiveSearch(q);
  const [adding, setAdding] = useState<number | null>(null);

  const add = async (tmdbId: number, type: 'movie' | 'tv') => {
    setAdding(tmdbId);
    try { const { data } = await api.post<ListItem>(`/admin/lists/custom/${listId}/items`, { tmdbId, type }); showToast(`Added ${data.title}`, 'success'); await onAdded(); }
    catch (err) { toastApiError(err, 'Could not add it'); }
    finally { setAdding(null); }
  };

  return (
    <div>
      <p className="admin-group-label">Add titles</p>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ndp-text-dim" />
        <input className="input w-full !pl-9" placeholder="Search movies and TV" value={q} onChange={(e) => setQ(e.target.value)} />
        {loading && <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>
      {items.length > 0 && (
        <div className="admin-group divide-y divide-white/[0.06] mt-2 max-h-96 overflow-auto">
          {items.slice(0, 12).map((r) => {
            const type = r.media_type === 'tv' ? 'tv' : 'movie';
            const title = (r as { title?: string; name?: string }).title ?? (r as { name?: string }).name ?? '';
            const date = (r as { release_date?: string; first_air_date?: string }).release_date ?? (r as { first_air_date?: string }).first_air_date ?? '';
            const onList = existing.has(`${type}:${r.id}`);
            return (
              <div key={`${type}-${r.id}`} className="admin-row !min-h-0 !py-2">
                {r.poster_path ? <img src={posterUrl(r.poster_path, 'w92')} alt="" className="w-8 h-12 rounded object-cover flex-shrink-0" loading="lazy" /> : <span className="w-8 h-12 rounded bg-white/[0.05] flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ndp-text truncate">{title} {date ? <span className="text-ndp-text-dim">({date.slice(0, 4)})</span> : null}</p>
                  <p className="text-xs text-ndp-text-dim">{type === 'movie' ? 'Movie' : 'TV'}</p>
                </div>
                <button type="button" className="btn-secondary !py-1.5 text-sm inline-flex items-center gap-1" disabled={onList || adding === r.id} onClick={() => void add(r.id, type)}>
                  {adding === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}{onList ? 'On list' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
