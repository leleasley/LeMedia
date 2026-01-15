export function pickTrailerUrl(media: any): string | null {
  const list: any[] = media?.videos?.results ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;

  const yt = list.filter(v => (v?.site || "").toLowerCase() === "youtube");
  const candidates = yt.length ? yt : list;

  const score = (v: any) => {
    const type = (v?.type || "").toLowerCase();
    const name = (v?.name || "").toLowerCase();
    return (
      (v?.official ? 100 : 0) +
      (type === "trailer" ? 50 : 0) +
      (name.includes("official") ? 10 : 0) +
      (typeof v?.size === "number" ? Math.min(10, v.size / 360) : 0)
    );
  };

  const best = [...candidates].sort((a, b) => score(b) - score(a))[0];
  const key = best?.key;
  if (!key) return null;

  if ((best?.site || "").toLowerCase() === "youtube") return `https://www.youtube.com/watch?v=${key}`;
  return null;
}

