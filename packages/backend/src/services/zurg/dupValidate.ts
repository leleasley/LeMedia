/**
 * Zurg's duplicate report groups releases by a loose name match, so it puts "It Was Always You"
 * in the group for "Always" and a S.W.A.T. season pack in 9-1-1's Season 7. This decides which
 * members really belong to a group, and whether the group is a duplicate worth showing.
 *
 * - A release Radarr/Sonarr uses for a *different* title is not part of the group.
 * - A release nobody uses must match the group's title by name (and year, for films; season, for
 *   shows), otherwise we can't say it's a copy of this title.
 * - Radarr uses one file per film and Sonarr one per episode, so two in-use releases of the same
 *   title are never redundant (for a season they cover different episodes). A group is only a
 *   duplicate when, after the above, it still holds an unused copy next to another release.
 */

export interface GroupItem { title?: string; year?: number; season?: number }
export interface ValidMember { name: string; state: string; reasons: string[] }

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const stripYear = (s: string) => s.replace(/\s*\((19|20)\d{2}\)\s*$/, '').trim();

/** "radarr:movies uses it for X (movies/Folder (2017)/file.mkv)." → "Folder (2017)" */
function usedFolder(reason: string | undefined): string | null {
  const m = /uses it for .* \(((?:movies|tv)\/[^/]+)\//.exec(reason ?? '');
  return m ? m[1].split('/')[1] : null;
}

function sameTitle(folder: string, kind: string, item: GroupItem, groupTitle: string): boolean {
  const title = item.title ?? stripYear(groupTitle);
  const f = norm(stripYear(folder));
  if (f !== norm(stripYear(title)) && f !== norm(title)) return false;
  if (kind === 'movie' && item.year) {
    const y = /\((\d{4})\)\s*$/.exec(folder)?.[1];
    if (y && Math.abs(Number(y) - item.year) > 1) return false;
  }
  return true;
}

/** Does an unused release's name look like this film / this show's season? */
function nameMatches(name: string, kind: string, item: GroupItem, groupTitle: string): boolean {
  const title = stripYear(item.title ?? groupTitle);
  const words = name.replace(/[._]+/g, ' ').replace(/[[\](){}]/g, ' ');
  if (kind === 'movie') {
    const y = /\b((?:19|20)\d{2})\b/.exec(words);
    if (!y) return false;
    const before = words.slice(0, y.index);
    if (norm(before) !== norm(title)) return false;
    return !item.year || Math.abs(Number(y[1]) - item.year) <= 1;
  }
  const n = norm(words);
  const t = norm(title);
  const withYear = item.year ? norm(`${title} ${item.year}`) : null;
  if (!(n.startsWith(t) || (withYear && n.startsWith(withYear)))) return false;
  if (kind === 'season' && item.season) {
    const s = item.season;
    if (!new RegExp(`\\b(?:s0*${s}(?!\\d)|season\\s*0*${s}(?!\\d))`, 'i').test(words)) return false;
  }
  return true;
}

/** Keep only the members that belong to the group; null when what's left isn't a duplicate. */
export function validateGroup<M extends ValidMember>(group: { kind: string; title: string; items?: GroupItem[] }, members: M[]): M[] | null {
  const item = group.items?.[0] ?? {};
  const kept = members.filter((m) => {
    if (m.state === 'referenced') {
      const folder = usedFolder(m.reasons[0]);
      return folder ? sameTitle(folder, group.kind, item, group.title) : true;
    }
    return nameMatches(m.name, group.kind, item, group.title);
  });
  const unused = kept.filter((m) => m.state === 'no_reference');
  return kept.length >= 2 && unused.length >= 1 ? kept : null;
}
