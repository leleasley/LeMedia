import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Save, CheckCircle } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import type { QualityProfile, RootFolder } from '@/types';

export function PathsTab() {
  const { t } = useTranslation();
  const [radarrFolders, setRadarrFolders] = useState<RootFolder[]>([]);
  const [sonarrFolders, setSonarrFolders] = useState<RootFolder[]>([]);
  const [radarrProfiles, setRadarrProfiles] = useState<QualityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [qualityProfile, setQualityProfile] = useState('');
  const [movieFolder, setMovieFolder] = useState('');
  const [tvFolder, setTvFolder] = useState('');
  const [animeFolder, setAnimeFolder] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, rFolders, sFolders, rProfiles] = await Promise.all([
          api.get('/admin/settings'),
          api.get('/admin/radarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/sonarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/radarr/profiles').catch(() => ({ data: [] })),
        ]);
        const s = settingsRes.data;
        setQualityProfile(s.defaultQualityProfile?.toString() || '');
        setMovieFolder(s.defaultMovieFolder || '');
        setTvFolder(s.defaultTvFolder || '');
        setAnimeFolder(s.defaultAnimeFolder || '');
        setRadarrFolders(rFolders.data);
        setSonarrFolders(sFolders.data);
        setRadarrProfiles(rProfiles.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const saveDefaults = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/admin/settings', {
        defaultQualityProfile: qualityProfile ? Number.parseInt(qualityProfile) : null,
        defaultMovieFolder: movieFolder || null,
        defaultTvFolder: tvFolder || null,
        defaultAnimeFolder: animeFolder || null,
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 min-h-[40px]">
        <h2 className="font-display-title text-3xl text-ndp-text">{t('admin.paths.defaults_title')}</h2>
        <button onClick={saveDefaults} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-4 py-2 min-h-[40px] rounded-lg transition-colors', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? t('common.saved') : t('common.save')}
        </button>
      </div>

      <div>
        <div className="admin-group divide-y divide-white/[0.06]">
          <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-sm font-medium text-ndp-text sm:w-40 flex-shrink-0">{t('admin.paths.quality_profile')}</span>
            <select value={qualityProfile} onChange={(e) => setQualityProfile(e.target.value)} className="input w-full min-w-0 sm:flex-1 text-sm py-2.5 truncate">
              <option value="">Auto</option>
              {radarrProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-sm font-medium text-ndp-text sm:w-40 flex-shrink-0">{t('admin.paths.movies')}</span>
            <select value={movieFolder} onChange={(e) => setMovieFolder(e.target.value)} className="input w-full min-w-0 sm:flex-1 text-sm py-2.5 truncate">
              <option value="">Auto</option>
              {radarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-sm font-medium text-ndp-text sm:w-40 flex-shrink-0">{t('admin.paths.series')}</span>
            <select value={tvFolder} onChange={(e) => setTvFolder(e.target.value)} className="input w-full min-w-0 sm:flex-1 text-sm py-2.5 truncate">
              <option value="">Auto</option>
              {sonarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-sm font-medium text-ndp-text sm:w-40 flex-shrink-0">{t('admin.paths.anime')}</span>
            <select value={animeFolder} onChange={(e) => setAnimeFolder(e.target.value)} className="input w-full min-w-0 sm:flex-1 text-sm py-2.5 truncate">
              <option value="">Auto</option>
              {sonarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
            </select>
          </div>
        </div>
        <p className="admin-hint">{t('admin.paths.defaults_desc')}</p>
      </div>
    </div>
  );
}
