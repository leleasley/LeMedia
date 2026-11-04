import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, Pencil, Trash2, Plus, RotateCcw, Save } from 'lucide-react';
import api from '@/lib/api';
import { AdminTabLayout } from './AdminTabLayout';
import { Spinner } from './Spinner';
import { SectionEditor } from './SectionEditor';
import Switch from '@/components/ui/Switch';

const BUILTIN_ENDPOINTS: Record<string, string> = {
  hero: 'TMDB Trending → Hero carousel',
  recently_added: 'GET /media/recent',
  trending: 'GET /tmdb/trending',
  popular_movies: 'GET /tmdb/movies/popular',
  popular_tv: 'GET /tmdb/tv/popular',
  trending_anime: 'GET /tmdb/tv/trending-anime',
  genres: 'TMDB Genres → Genre cards',
  streaming: 'TMDB Providers → Streaming logos',
  upcoming: 'GET /tmdb/movies/upcoming',
};

interface HomepageSection {
  id: string;
  title: string;
  type: 'builtin' | 'custom';
  enabled: boolean;
  size?: 'default' | 'large';
  builtinKey?: string;
  endpoint?: string;
  query?: {
    mediaType?: string;
    genres?: number[];
    yearGte?: number;
    yearLte?: number;
    releasedWithin?: string;
    voteAverageGte?: number;
    voteCountGte?: number;
    sortBy?: string;
    language?: string;
    watchProviders?: number[];
    watchRegion?: string;
    [key: string]: unknown;
  };
}

function formatQueryPreview(query?: HomepageSection['query']): string {
  if (!query) return '';
  const parts: string[] = [];
  if (query.mediaType) parts.push(query.mediaType === 'movie' ? 'Movies' : 'Series');
  if (query.genres?.length) parts.push(`${query.genres.length} genre${query.genres.length > 1 ? 's' : ''}`);
  if (query.yearGte && query.yearLte) parts.push(`${query.yearGte}–${query.yearLte}`);
  else if (query.yearGte) parts.push(`${query.yearGte}+`);
  else if (query.yearLte) parts.push(`until ${query.yearLte}`);
  if (query.voteAverageGte) parts.push(`${query.voteAverageGte}+ rating`);
  if (query.watchProviders?.length) parts.push(`${query.watchProviders.length} provider${query.watchProviders.length > 1 ? 's' : ''}`);
  return parts.join(' \u00b7 ');
}

export function HomepageTab() {
  const { t } = useTranslation();
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editingSection, setEditingSection] = useState<HomepageSection | null | 'new'>(null);

  // Drag and drop reorder
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/admin/homepage');
        setSections(data.sections || data || []);
      } catch (err) {
        console.error('Failed to load homepage sections', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => { dragItem.current = index; setDragIndex(index); };
  const handleDragEnter = (index: number) => { dragOverItem.current = index; setDragOverIndex(index); };
  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
      setDragIndex(null);
      setDragOverIndex(null);
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    const reordered = [...sections];
    const [dragged] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, dragged);
    setSections(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
    dragItem.current = null;
    dragOverItem.current = null;
    // Auto-save on reorder
    try {
      await api.put('/admin/homepage', { sections: reordered });
    } catch (err) {
      console.error('Failed to save reorder', err);
    }
  };

  const toggleSection = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const deleteSection = async (id: string) => {
    const updated = sections.filter(s => s.id !== id);
    setSections(updated);
    setConfirmDeleteId(null);
    try {
      await api.put('/admin/homepage', { sections: updated });
    } catch (err) {
      console.error('Failed to save after delete:', err);
    }
  };

  const addCustomSection = () => {
    setEditingSection('new');
  };

  const resetToDefault = async () => {
    setConfirmReset(false);
    try {
      const { data } = await api.put('/admin/homepage', { reset: true });
      setSections(data.sections || data || []);
    } catch (err) {
      console.error('Failed to reset homepage', err);
    }
  };

  const saveSections = async () => {
    setSaving(true);
    try {
      await api.put('/admin/homepage', { sections });
    } catch (err) {
      console.error('Failed to save homepage sections', err);
    } finally {
      setSaving(false);
    }
  };

  const editSection = (id: string) => {
    const target = sections.find(s => s.id === id);
    if (target) setEditingSection(target);
  };

  const handleSectionSave = async (updated: HomepageSection) => {
    let next: HomepageSection[];
    if (editingSection === 'new') {
      next = [...sections, updated];
    } else {
      next = sections.map(s => s.id === updated.id ? updated : s);
    }
    setSections(next);
    setEditingSection(null);
    try {
      await api.put('/admin/homepage', { sections: next });
    } catch (err) {
      console.error('Failed to save after section edit', err);
    }
  };

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout
      title={t('admin.tab.homepage', 'Homepage')}
      count={sections.length}
      actions={
        <div className="flex items-center gap-2">
          {/* Icon-only on phones so the header never overflows; labels return from sm up. */}
          <button
            onClick={() => setConfirmReset(true)}
            aria-label={t('admin.homepage.reset', 'Reset to default')}
            title={t('admin.homepage.reset', 'Reset to default')}
            className="btn-secondary text-sm flex items-center justify-center gap-2 min-h-[40px] min-w-[40px] px-2.5 sm:px-4 py-2"
          >
            <RotateCcw className="w-4 h-4" /> <span className="hidden sm:inline">{t('admin.homepage.reset', 'Reset to default')}</span>
          </button>
          <button
            onClick={addCustomSection}
            aria-label={t('admin.homepage.add_section', 'Add custom section')}
            title={t('admin.homepage.add_section', 'Add custom section')}
            className="btn-secondary text-sm flex items-center justify-center gap-2 min-h-[40px] min-w-[40px] px-2.5 sm:px-4 py-2"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t('admin.homepage.add_section', 'Add custom section')}</span>
          </button>
          <button onClick={saveSections} disabled={saving} className="btn-primary text-sm flex items-center justify-center gap-2 min-h-[40px] px-3 sm:px-4 py-2">
            <Save className="w-4 h-4" /> {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </button>
        </div>
      }
    >
      <p className="admin-hint mt-0 mb-3">
        {t('admin.homepage.help', 'Drag sections to reorder. Toggle visibility or add custom sections.')}
      </p>

      <div className="admin-group divide-y divide-white/[0.06]">
        {sections.map((section, index) => {
          const queryPreview = formatQueryPreview(section.query);
          const isDragging = dragIndex === index;
          const isOver = dragOverIndex === index && dragIndex !== null && dragIndex !== index;
          return (
            <div key={section.id}>
              {/* Drop indicator line, shows above the hovered item */}
              {isOver && dragIndex !== null && dragIndex > index && (
                <div className="h-0.5 bg-ndp-accent" />
              )}
              <div
                className={`cursor-grab active:cursor-grabbing transition-colors ${isOver ? 'bg-ndp-accent/[0.06]' : 'hover:bg-white/[0.02]'}`}
                style={{
                  opacity: isDragging ? 0.4 : undefined,
                }}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
              >
              <div className="admin-row pl-2 sm:pl-3">
                <GripVertical className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />

                <div className={`flex-1 min-w-0 ${!section.enabled ? 'opacity-40' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-ndp-text mr-0.5">{t(section.title, section.title)}</span>
                    {section.type === 'builtin' ? (
                      <span className="admin-chip">Builtin</span>
                    ) : section.endpoint ? (
                      <span className="admin-chip bg-emerald-500/15 text-emerald-300">Endpoint</span>
                    ) : (
                      <span className="admin-chip bg-sky-500/15 text-sky-300">Discover</span>
                    )}
                    {section.size === 'large' && <span className="admin-chip bg-ndp-accent/15 text-ndp-accent">Large</span>}
                    {section.size !== 'large' && <span className="admin-chip">Default</span>}
                  </div>
                  {section.type === 'custom' && section.endpoint && (
                    <p className="text-xs text-ndp-text-dim mt-1 font-mono truncate">GET {section.endpoint}</p>
                  )}
                  {section.type === 'custom' && !section.endpoint && queryPreview && (
                    <p className="text-xs text-ndp-text-dim mt-1">{queryPreview}</p>
                  )}
                  {section.type === 'builtin' && section.builtinKey && (
                    <p className="text-xs text-ndp-text-dim mt-1 font-mono truncate">{BUILTIN_ENDPOINTS[section.builtinKey] || section.builtinKey}</p>
                  )}
                </div>

                <div className="flex items-center flex-shrink-0 -mr-1.5">
                  {/* Toggle switch */}
                  <Switch checked={section.enabled} onChange={() => toggleSection(section.id)} label={t(section.title, section.title)} />

                  {/* Edit */}
                  <button
                    onClick={() => editSection(section.id)}
                    className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors"
                    title={t('common.edit', 'Edit')}
                    aria-label={t('common.edit', 'Edit')}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {/* Delete (custom only) */}
                  {section.type === 'custom' && (
                    <button
                      onClick={() => setConfirmDeleteId(section.id)}
                      className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 rounded-lg transition-colors"
                      title={t('common.delete', 'Delete')}
                      aria-label={t('common.delete', 'Delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              </div>
              {/* Drop indicator line, shows below the hovered item */}
              {isOver && dragIndex !== null && dragIndex < index && (
                <div className="h-0.5 bg-ndp-accent" />
              )}
            </div>
          );
        })}

        {sections.length === 0 && (
          <div className="text-center px-4 py-12 text-ndp-text-dim text-sm">
            {t('admin.homepage.empty', 'No sections configured. Add a custom section or reset to defaults.')}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (
        <div className="modal-overlay z-50" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-panel p-5 sm:p-6 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ndp-text">{t('admin.homepage.confirm_delete_title', 'Delete section?')}</h3>
            <p className="text-sm text-ndp-text-muted">{t('admin.homepage.confirm_delete_desc', 'This custom section will be removed from the homepage layout.')}</p>
            <div className="flex gap-2 justify-end pt-3">
              <button onClick={() => setConfirmDeleteId(null)} className="btn-secondary text-sm px-4 py-2">{t('common.cancel', 'Cancel')}</button>
              <button onClick={() => deleteSection(confirmDeleteId)} className="btn-danger text-sm px-4 py-2">{t('common.delete', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirmation modal */}
      {confirmReset && (
        <div className="modal-overlay z-50" onClick={() => setConfirmReset(false)}>
          <div className="modal-panel p-5 sm:p-6 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ndp-text">{t('admin.homepage.confirm_reset_title', 'Reset to default?')}</h3>
            <p className="text-sm text-ndp-text-muted">{t('admin.homepage.confirm_reset_desc', 'This will replace your current layout with the default homepage sections.')}</p>
            <div className="flex gap-2 justify-end pt-3">
              <button onClick={() => setConfirmReset(false)} className="btn-secondary text-sm px-4 py-2">{t('common.cancel', 'Cancel')}</button>
              <button onClick={resetToDefault} className="btn-danger text-sm px-4 py-2">{t('admin.homepage.reset', 'Reset to default')}</button>
            </div>
          </div>
        </div>
      )}
      {/* Section editor modal */}
      {editingSection !== null && (
        <SectionEditor
          section={editingSection === 'new' ? null : editingSection}
          onSave={handleSectionSave}
          onClose={() => setEditingSection(null)}
        />
      )}
    </AdminTabLayout>
  );
}
