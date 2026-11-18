import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Pin, X } from 'lucide-react';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { showToast, toastApiError } from '@/utils/toast';
import { Spinner } from '@/components/Spinner';

interface WweSettings {
  include_types: string[]; include_nxt: boolean; include_big_four: boolean; include_snme: boolean; include_non_wwe: boolean; include_future: boolean;
  from_year: number; to_year: number;
}
interface WweStatus {
  settings: WweSettings;
  availableTypes: string[];
  lastSync: { at?: string; included?: number; resolved?: number; movies?: number };
  counts: { total: number; resolved: number; tv: number; review: number; unmatched: number; pinned: number };
  needsReview: { sourceId: string; title: string; year: number; date: string; match: string; note: string; url: string; candidates: { id: number; title: string; year: number }[] }[];
  pins: { sourceId: string; title: string; year: number; mediaType: string; tmdbId: number; event: string }[];
  sourceUrl: string;
}

const TOGGLES: { key: keyof WweSettings; label: string }[] = [
  { key: 'include_big_four', label: 'Big four (WrestleMania, Royal Rumble, SummerSlam, Survivor Series)' },
  { key: 'include_nxt', label: 'NXT events' },
  { key: 'include_snme', label: 'Saturday Night\'s Main Event' },
  { key: 'include_non_wwe', label: 'Other promotions in the feed (WCW, ECW, AEW...)' },
  { key: 'include_future', label: 'Upcoming events' },
];

/** WWE events list: which events count, and the matches that need a human (pin a TMDB movie). */
export function WweReview() {
  const [st, setSt] = useState<WweStatus | null>(null);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [showReview, setShowReview] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get<WweStatus>('/admin/lists/wwe'); setSt(data); } catch (err) { toastApiError(err, 'Could not load the WWE events'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveSettings = async (next: WweSettings) => {
    setSt((s) => (s ? { ...s, settings: next } : s));
    try { await api.put('/admin/lists/wwe/settings', next); } catch (err) { toastApiError(err, 'Could not save'); void load(); }
  };

  const pin = async (sourceId: string) => {
    try { await api.post('/admin/lists/wwe/pins', { sourceId, target }); showToast('Pinned, it is picked up at the next sync', 'success'); setPinFor(null); setTarget(''); await load(); }
    catch (err) { toastApiError(err, 'Could not pin it'); }
  };

  if (!st) return <p className="text-sm text-ndp-text-dim flex items-center gap-2"><Spinner size="sm" />Loading WWE events…</p>;
  const s = st.settings;

  return (
    <div className="space-y-3 rounded-xl bg-white/[0.02] ring-1 ring-inset ring-white/[0.06] p-3">
      <p className="text-xs text-ndp-text-dim">
        {st.counts.total} events from <a href={st.sourceUrl} target="_blank" rel="noreferrer" className="text-ndp-accent hover:underline">The SmackDown Hotel</a>:
        {' '}{st.counts.resolved} matched to TMDB movies, {st.counts.tv} TV episodes (never added), {st.counts.review} to review, {st.counts.unmatched} unmatched, {st.counts.pinned} pinned by hand.
      </p>

      <div>
        <p className="admin-group-label !mb-1">Event types</p>
        <div className="flex flex-wrap gap-2">
          {st.availableTypes.map((t) => {
            const on = s.include_types.includes(t);
            return (
              <button key={t} type="button" onClick={() => void saveSettings({ ...s, include_types: on ? s.include_types.filter((x) => x !== t) : [...s.include_types, t] })}
                className={`px-2.5 py-1 rounded-lg text-xs ring-1 ring-inset ${on ? 'bg-ndp-accent/15 ring-ndp-accent/40 text-ndp-text' : 'ring-white/[0.08] text-ndp-text-dim'}`}>{t}</button>
            );
          })}
        </div>
      </div>
      <div className="rounded-xl ring-1 ring-inset ring-white/[0.06] divide-y divide-white/[0.06]">
        {TOGGLES.map((tg) => (
          <div key={tg.key} className="admin-row !min-h-0 !py-1">
            <p className="flex-1 text-sm text-ndp-text">{tg.label}</p>
            <Switch checked={!!s[tg.key]} onChange={(v) => void saveSettings({ ...s, [tg.key]: v })} label={tg.label} className="-mr-1.5" />
          </div>
        ))}
        <div className="admin-row !min-h-0 !py-2 flex-wrap">
          <p className="flex-1 text-sm text-ndp-text">Years</p>
          <input className="input !py-1.5 w-24" type="number" placeholder="From" value={s.from_year || ''} onChange={(e) => setSt({ ...st, settings: { ...s, from_year: Number(e.target.value) || 0 } })} onBlur={() => void saveSettings(s)} />
          <input className="input !py-1.5 w-24" type="number" placeholder="To" value={s.to_year || ''} onChange={(e) => setSt({ ...st, settings: { ...s, to_year: Number(e.target.value) || 0 } })} onBlur={() => void saveSettings(s)} />
        </div>
      </div>

      {st.needsReview.length > 0 && (
        <div>
          <button type="button" className="text-sm text-ndp-accent hover:underline" onClick={() => setShowReview(!showReview)}>
            {showReview ? 'Hide' : 'Show'} {st.needsReview.length} event{st.needsReview.length === 1 ? '' : 's'} needing a TMDB match
          </button>
          {showReview && (
            <div className="mt-2 rounded-xl ring-1 ring-inset ring-white/[0.06] divide-y divide-white/[0.06] max-h-[28rem] overflow-auto">
              {st.needsReview.map((r) => (
                <div key={r.sourceId} className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-sm text-ndp-text truncate">{r.title} <span className="text-ndp-text-dim">{r.date || r.year || ''}</span></p>
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-ndp-text-dim hover:text-ndp-text" aria-label="Open event"><ExternalLink className="w-3.5 h-3.5" /></a>
                    <button type="button" className="text-xs text-ndp-accent hover:underline inline-flex items-center gap-1" onClick={() => { setPinFor(pinFor === r.sourceId ? null : r.sourceId); setTarget(''); }}><Pin className="w-3 h-3" />Pin</button>
                  </div>
                  {r.candidates.length > 0 && <p className="text-xs text-ndp-text-dim truncate">TMDB has: {r.candidates.map((c) => `${c.title} (${c.year || '?'})`).join(', ')}</p>}
                  {pinFor === r.sourceId && (
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void pin(r.sourceId); }}>
                      <input className="input !py-1.5 flex-1 min-w-0 text-sm" placeholder="TMDB movie link or id" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus />
                      <button type="submit" className="btn-primary !py-1.5 text-sm" disabled={!target.trim()}>Pin</button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {st.pins.length > 0 && (
        <div>
          <p className="admin-group-label !mb-1">Pinned by hand</p>
          <div className="rounded-xl ring-1 ring-inset ring-white/[0.06] divide-y divide-white/[0.06]">
            {st.pins.map((p) => (
              <div key={p.sourceId} className="admin-row !min-h-0 !py-2 text-sm">
                <span className="flex-1 min-w-0 truncate text-ndp-text">{p.event || p.title}</span>
                <span className="text-xs text-ndp-text-dim truncate max-w-[45%]">{p.title}{p.year ? ` (${p.year})` : ''}</span>
                <button type="button" aria-label="Unpin" className="p-1 rounded text-ndp-text-dim hover:text-red-300"
                  onClick={async () => { try { await api.delete(`/admin/lists/wwe/pins/${p.sourceId}`); await load(); } catch (err) { toastApiError(err, 'Could not unpin'); } }}><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
