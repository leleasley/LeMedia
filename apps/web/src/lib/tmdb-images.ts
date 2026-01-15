export function tmdbImageUrl(
  path: string | null | undefined,
  size: string,
  _useProxy?: boolean
): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/imageproxy/")) return path;
  if (
    path.startsWith("/HomeScreen/") ||
    path.startsWith("/Items/") ||
    path.startsWith("/Images/") ||
    path.startsWith("/Videos/")
  ) {
    return path;
  }
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
