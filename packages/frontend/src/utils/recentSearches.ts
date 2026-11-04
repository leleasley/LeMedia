/** Recent search queries, kept per-device in localStorage (most recent first). */
const KEY = 'lemedia-recent-searches';
const MAX = 8;

export function getRecentSearches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((q): q is string => typeof q === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): void {
  const q = query.trim();
  if (q.length < 2) return;
  const next = [q, ...getRecentSearches().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full / private mode */ }
}

export function removeRecentSearch(query: string): string[] {
  const next = getRecentSearches().filter((r) => r !== query);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function clearRecentSearches(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
