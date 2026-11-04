/** Provider profile photos (Google, GitHub, Discord, Plex) go through LeMedia's own
 *  `/api/app/avatar` proxy — browsers often refuse hotlinked Google photos. Everything else
 *  (data: URLs, same-origin, other hosts) is returned unchanged. */
const PROXIED = /^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|githubusercontent\.com|discordapp\.com|discordapp\.net|plex\.tv)\//i;

export function avatarSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return PROXIED.test(url) ? `/api/app/avatar?u=${encodeURIComponent(url)}` : url;
}
