import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Search, Tag, X, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { toastApiError } from '@/utils/toast';

interface Keyword {
  id: number;
  tmdbId: number;
  name: string;
  tag: string | null;
  mediaCount: number;
}

const PAGE_SIZE = 50;

// Tag colors — nsfw gets red, others cycle through these
const TAG_COLORS: Record<string, string> = {
  nsfw: 'bg-red-500/15 text-red-300 ring-red-500/25',
};
const DEFAULT_TAG_COLORS = [
  'bg-lime-500/15 text-lime-300 ring-lime-500/25',
  'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25',
  'bg-amber-500/15 text-amber-300 ring-amber-500/25',
  'bg-cyan-500/15 text-cyan-300 ring-cyan-500/25',
  'bg-orange-500/15 text-orange-300 ring-orange-500/25',
  'bg-sky-500/15 text-sky-300 ring-sky-500/25',
];

function getTagColor(tag: string, index: number): string {
  return TAG_COLORS[tag] || DEFAULT_TAG_COLORS[index % DEFAULT_TAG_COLORS.length];
}

/** Inline autocomplete tag input for a single keyword row */
function TagCell({ keyword, allTags, onUpdate }: Readonly<{ keyword: Keyword; allTags: string[]; onUpdate: (tmdbId: number, tag: string | null) => void }>) {
  const { t } = useTranslation();
  // All hooks MUST run unconditionally on every render. Previously inputRef / dropPos /
  // useEffect lived below the "display tag" early return, so the render after setting a tag
  // changed the hook count and crashed. Keep every hook above any conditional return.
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const suggestions = input.trim()
    ? allTags.filter((t) => t.toLowerCase().includes(input.toLowerCase()) && t !== keyword.tag)
    : allTags.filter((t) => t !== keyword.tag);

  useEffect(() => {
    if (editing && inputRef.current && suggestions.length > 0) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [editing, suggestions]);

  function handleSelect(tag: string) {
    onUpdate(keyword.tmdbId, tag);
    setEditing(false);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      handleSelect(input.trim().toLowerCase());
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setInput('');
    }
  }

  if (keyword.tag && !editing) {
    const tagIndex = allTags.indexOf(keyword.tag);
    return (
      <div className="flex items-center gap-1 min-w-0">
        <span className={`admin-chip ring-1 ring-inset min-w-0 ${getTagColor(keyword.tag, tagIndex)}`}>
          <span className="truncate">{keyword.tag}</span>
        </span>
        <button
          onClick={() => onUpdate(keyword.tmdbId, null)}
          className="w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/[0.06] transition-colors"
          title={t('admin.keywords.tag.clear')}
          aria-label={t('admin.keywords.tag.clear')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="w-full">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => { setEditing(false); setInput(''); }, 150)}
          placeholder={t('admin.keywords.tag.placeholder')}
          autoFocus
          className="w-full px-3 h-8 bg-ndp-surface-light rounded-lg text-xs text-ndp-text placeholder:text-ndp-text-dim border border-ndp-accent/50 focus:outline-none focus:ring-2 focus:ring-ndp-accent/30"
        />
        {suggestions.length > 0 && createPortal(
          <div
            className="fixed bg-ndp-surface border border-white/[0.08] rounded-lg py-1 shadow-[0_12px_32px_rgba(0,0,0,0.6)] z-[9999] max-h-40 overflow-y-auto"
            style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
          >
            {suggestions.map((tag, i) => (
              <button
                key={tag}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(tag); }}
                className="w-full text-left px-3 min-h-[36px] text-xs text-ndp-text hover:bg-white/[0.06] transition-colors flex items-center gap-2"
              >
                <span className={`w-2 h-2 rounded-full ring-1 flex-shrink-0 ${getTagColor(tag, i)}`} />
                <span className="truncate">{tag}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="px-3 h-8 rounded-lg text-xs font-medium text-ndp-text-dim border border-dashed border-white/[0.12] hover:text-ndp-text hover:border-white/25 transition-colors"
    >
      + {t('admin.keywords.tag')}
    </button>
  );
}

export function KeywordsTab() {
  const { t } = useTranslation();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Keyword[]>('/admin/keywords')
      .then(({ data }) => setKeywords(data))
      .catch((err) => toastApiError(err, t('admin.keywords.load_failed')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => setPage(0), [search]);

  // Derive available tags from current keywords
  const allTags = [...new Set(keywords.map((k) => k.tag).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b));

  async function updateTag(tmdbId: number, tag: string | null) {
    try {
      await api.patch(`/admin/keywords/${tmdbId}`, { tag });
      setKeywords((prev) =>
        prev.map((k) => (k.tmdbId === tmdbId ? { ...k, tag } : k))
      );
    } catch (err) { toastApiError(err, t('admin.keywords.update_failed')); }
  }

  const filtered = keywords.filter((k) =>
    k.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (a.tag && !b.tag) return -1;
    if (!a.tag && b.tag) return 1;
    return b.mediaCount - a.mediaCount;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-ndp-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (keywords.length === 0) {
    return (
      <div className="admin-group px-6 py-10 text-center">
        <div className="admin-icon-tile w-10 h-10 mx-auto mb-3 text-ndp-text-dim">
          <Tag className="w-5 h-5" />
        </div>
        <p className="text-sm text-ndp-text-muted max-w-sm mx-auto">{t('admin.keywords.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ndp-text-muted leading-relaxed">{t('admin.keywords.description')}</p>

      {/* Active tags summary */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag, i) => {
            const count = keywords.filter((k) => k.tag === tag).length;
            return (
              <span key={tag} className={`admin-chip ring-1 ring-inset ${getTagColor(tag, i)}`}>
                {tag} <span className="opacity-70 tabular-nums">({count})</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.keywords.search')}
          className="input w-full pl-10 py-2.5 text-sm"
        />
      </div>

      {/* List, column grid on desktop, stacked rows on phones */}
      <div className="admin-group divide-y divide-white/[0.06]">
        <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_6rem_12rem] gap-4 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">
          <span>{t('admin.keywords.name')}</span>
          <span className="text-right">{t('admin.keywords.media_count')}</span>
          <span>{t('admin.keywords.tag')}</span>
        </div>
        {paginated.map((kw) => (
          <div key={kw.tmdbId} className="flex items-center gap-3 px-4 py-2 min-h-[52px] sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_12rem] sm:gap-4 hover:bg-white/[0.02] transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ndp-text break-words">{kw.name}</p>
              <p className="sm:hidden mt-0.5 text-xs text-ndp-text-dim tabular-nums">{t('admin.keywords.media_count')} · {kw.mediaCount}</p>
            </div>
            <span className="hidden sm:block text-sm text-ndp-text-muted text-right tabular-nums">{kw.mediaCount}</span>
            <div className="w-36 sm:w-auto flex-shrink-0 flex justify-end sm:justify-start min-w-0">
              <TagCell keyword={kw} allTags={allTags} onUpdate={updateTag} />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ndp-text-dim tabular-nums">
          {filtered.length} / {keywords.length} keywords
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-ndp-text-muted tabular-nums px-1">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
