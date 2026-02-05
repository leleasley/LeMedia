export function tmdbImageUrl(
  path: string | null | undefined,
  size: string,
  useProxy?: boolean
): string | null {
  if (!path) return null;
  if (path.startsWith("/imageproxy/")) return path;
  if (
    path.startsWith("/HomeScreen/") ||
    path.startsWith("/Items/") ||
    path.startsWith("/Images/") ||
    path.startsWith("/Videos/")
  ) {
    return path;
  }

  const isHttp = path.startsWith("http://") || path.startsWith("https://");
  const isTmdbHttp = /^https?:\/\/image\.tmdb\.org\//.test(path);

  if (useProxy) {
    if (isTmdbHttp) {
      return path.replace(/^https?:\/\/image\.tmdb\.org\//, "/imageproxy/tmdb/");
    }
    if (!isHttp && path.startsWith("/")) {
      return `/imageproxy/tmdb/t/p/${size}${path}`;
    }
  }

  if (isHttp) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
