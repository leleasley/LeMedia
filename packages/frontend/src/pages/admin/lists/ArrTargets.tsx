import Switch from '@/components/ui/Switch';
import type { AddSettings, ArrChoices, ItemType } from './shared';

/** Quality profile + root folder for each *arr the list needs, and the search / only-new options. */
export function ArrTargets({ choices, types, value, onChange, showOnlyNew }: Readonly<{
  choices: ArrChoices | null;
  types: ItemType[];
  value: AddSettings;
  onChange: (next: AddSettings) => void;
  showOnlyNew?: boolean;
}>) {
  const set = (patch: Partial<AddSettings>) => onChange({ ...value, ...patch });
  const rows: { type: ItemType; name: string; profile: 'radarrProfileId' | 'sonarrProfileId'; root: 'radarrRoot' | 'sonarrRoot' }[] = [
    { type: 'movie', name: 'Radarr', profile: 'radarrProfileId', root: 'radarrRoot' },
    { type: 'show', name: 'Sonarr', profile: 'sonarrProfileId', root: 'sonarrRoot' },
  ];
  return (
    <div className="admin-group divide-y divide-white/[0.06]">
      {rows.filter((r) => types.includes(r.type)).map((r) => {
        const c = r.type === 'movie' ? choices?.movie : choices?.show;
        return (
          <div key={r.type} className="admin-row flex-wrap">
            <p className="text-sm font-medium text-ndp-text w-20 flex-shrink-0">{r.name}</p>
            {!c ? (
              <p className="text-sm text-red-300">{choices ? `${r.name} is not reachable` : 'Loading…'}</p>
            ) : (
              <div className="flex flex-1 flex-wrap gap-2 min-w-0">
                <select className="input !py-2 flex-1 min-w-[10rem]" aria-label={`${r.name} quality profile`}
                  value={value[r.profile] ?? ''} onChange={(e) => set({ [r.profile]: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Quality profile…</option>
                  {c.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className="input !py-2 flex-[2] min-w-[12rem]" aria-label={`${r.name} root folder`}
                  value={value[r.root] ?? ''} onChange={(e) => set({ [r.root]: e.target.value || undefined })}>
                  <option value="">Root folder…</option>
                  {c.roots.map((p) => <option key={p.path} value={p.path} disabled={!p.accessible}>{p.path}{p.accessible ? '' : ' (unreachable)'}</option>)}
                </select>
              </div>
            )}
          </div>
        );
      })}
      <div className="admin-row">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ndp-text">Search when added</p>
          <p className="text-xs text-ndp-text-dim">Off: titles are added monitored and picked up by your normal search and acquisition.</p>
        </div>
        <Switch checked={value.search} onChange={(v) => set({ search: v })} label="Search when added" className="-mr-1.5" />
      </div>
      {showOnlyNew && (
        <div className="admin-row">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ndp-text">Only titles new to the list</p>
            <p className="text-xs text-ndp-text-dim">Off: every sync adds anything on the list that isn't in your library (media heal's behaviour). On: only titles that appeared since the last sync, so something you deleted stays deleted.</p>
          </div>
          <Switch checked={!!value.onlyNew} onChange={(v) => set({ onlyNew: v })} label="Only titles new to the list" className="-mr-1.5" />
        </div>
      )}
    </div>
  );
}

export function targetsComplete(types: ItemType[], s: AddSettings) {
  return (!types.includes('movie') || (!!s.radarrProfileId && !!s.radarrRoot)) && (!types.includes('show') || (!!s.sonarrProfileId && !!s.sonarrRoot));
}
