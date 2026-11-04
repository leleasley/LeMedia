import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { showToast, toastApiError } from '@/utils/toast';
import { ArrTargets } from './ArrTargets';
import { useArrChoices, type AddSettings, type FilterKey, type ListsSettings } from './shared';

const FILTERS: { key: FilterKey; label: string; hint: string }[] = [
  { key: 'foreign', label: 'Foreign language', hint: 'Original language not in the allowed list below. Unknown language is never blocked.' },
  { key: 'anime', label: 'Anime', hint: 'Anime genre, or a series Sonarr types as anime.' },
  { key: 'kids', label: 'Kids', hint: 'Children\'s and kids genres.' },
  { key: 'gameShows', label: 'Game shows', hint: 'Game show genre.' },
  { key: 'talkShows', label: 'Talk shows', hint: 'Talk show genre.' },
  { key: 'reality', label: 'Reality', hint: 'Reality genre.' },
  { key: 'documentary', label: 'Documentaries', hint: 'Documentary genre.' },
];

/** Admin → Lists → Settings: content filters, sync interval, default targets and list-site keys. */
export function ListSettings({ settings, onSaved }: Readonly<{ settings: ListsSettings; onSaved: (s: ListsSettings) => void }>) {
  const choices = useArrChoices();
  const [rules, setRules] = useState(settings.filters.rules);
  const [langs, setLangs] = useState(settings.filters.allowedLanguages.join(', '));
  const [hours, setHours] = useState(settings.syncIntervalHours);
  const [defaults, setDefaults] = useState<AddSettings>({ search: false, ...settings.defaults });
  const [trakt, setTrakt] = useState('');
  const [mdb, setMdb] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (extra: Record<string, unknown> = {}) => {
    setSaving(true);
    try {
      const { data } = await api.put<ListsSettings>('/admin/lists/settings', {
        filters: { rules, allowedLanguages: langs.split(/[\s,]+/).filter(Boolean) },
        syncIntervalHours: hours, defaults, ...extra,
      });
      onSaved(data);
      setLangs(data.filters.allowedLanguages.join(', '));
      setTrakt(''); setMdb('');
      showToast('List settings saved', 'success');
    } catch (err) { toastApiError(err, 'Could not save the settings'); }
    finally { setSaving(false); }
  };

  const keysPatch = () => ({ ...(trakt.trim() ? { traktClientId: trakt.trim() } : {}), ...(mdb.trim() ? { mdblistApiKey: mdb.trim() } : {}) });

  return (
    <div className="space-y-6">
      <div>
        <p className="admin-group-label">Content filters</p>
        <div className="admin-group divide-y divide-white/[0.06]">
          <div className="admin-row !min-h-0 !py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ndp-text-dim">
            <span className="flex-1">Block</span><span className="w-14 text-center">Movies</span><span className="w-14 text-center">TV</span>
          </div>
          {FILTERS.map((f) => (
            <div key={f.key} className="admin-row">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ndp-text">{f.label}</p>
                <p className="text-xs text-ndp-text-dim">{f.hint}</p>
              </div>
              <Switch checked={rules[f.key].movie} onChange={(v) => setRules({ ...rules, [f.key]: { ...rules[f.key], movie: v } })} label={`${f.label} for movies`} />
              <Switch checked={rules[f.key].tv} onChange={(v) => setRules({ ...rules, [f.key]: { ...rules[f.key], tv: v } })} label={`${f.label} for TV`} />
            </div>
          ))}
          <div className="admin-row flex-wrap">
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-medium text-ndp-text">Allowed languages</p>
              <p className="text-xs text-ndp-text-dim">Language codes or names, comma separated, e.g. en, ga or English, Irish.</p>
            </div>
            <input className="input !py-2 w-full sm:w-64" value={langs} onChange={(e) => setLangs(e.target.value)} />
          </div>
        </div>
        <p className="admin-hint">Radarr and Sonarr exclusion lists and the LeMedia blacklist always apply. Filters are checked against the list's data and again against the Radarr or Sonarr record before anything is added.</p>
      </div>

      <div>
        <p className="admin-group-label">Syncing</p>
        <div className="admin-group divide-y divide-white/[0.06]">
          <div className="admin-row">
            <p className="flex-1 text-sm font-medium text-ndp-text">Re-read subscribed lists every</p>
            <select className="input !py-2 w-32" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[1, 2, 3, 6, 12, 24, 48, 168].map((h) => <option key={h} value={h}>{h === 168 ? '1 week' : h === 1 ? '1 hour' : `${h} hours`}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div>
        <p className="admin-group-label">Defaults for new lists</p>
        <ArrTargets choices={choices} types={['movie', 'show']} value={defaults} onChange={setDefaults} />
      </div>

      <div>
        <p className="admin-group-label">List site keys</p>
        <div className="admin-group divide-y divide-white/[0.06]">
          <KeyRow label="MDBList API key" hint="Needed for DMM browse pages and MDBList search; gives MDBList lists their languages. Free at mdblist.com/preferences."
            isSet={settings.mdblistApiKeySet} value={mdb} onChange={setMdb} onClear={() => void save({ mdblistApiKey: null })} />
          <KeyRow label="Trakt client ID" hint="Needed for Trakt lists, watchlists, charts and DMM genre pages. Free at trakt.tv/oauth/applications."
            isSet={settings.traktClientIdSet} value={trakt} onChange={setTrakt} onClear={() => void save({ traktClientId: null })} />
        </div>
        <p className="admin-hint">Keys are stored encrypted and never shown again.</p>
      </div>

      <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={saving} onClick={() => void save(keysPatch())}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save settings
      </button>
    </div>
  );
}

function KeyRow({ label, hint, isSet, value, onChange, onClear }: Readonly<{ label: string; hint: string; isSet: boolean; value: string; onChange: (v: string) => void; onClear: () => void }>) {
  return (
    <div className="admin-row flex-wrap">
      <div className="flex-1 min-w-[12rem]">
        <p className="text-sm font-medium text-ndp-text">{label} {isSet && <span className="admin-chip bg-emerald-500/15 text-emerald-300 ml-1">Saved</span>}</p>
        <p className="text-xs text-ndp-text-dim">{hint}</p>
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <input type="password" autoComplete="off" className="input !py-2 flex-1 sm:w-56" placeholder={isSet ? 'Enter a new one to replace' : 'Paste it here'} value={value} onChange={(e) => onChange(e.target.value)} />
        {isSet && <button type="button" className="btn-secondary !py-2 text-sm" onClick={onClear}>Clear</button>}
      </div>
    </div>
  );
}
