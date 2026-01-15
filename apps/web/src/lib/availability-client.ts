export async function fetchAvailabilityBatched(
  type: "movie" | "tv",
  ids: number[],
  batchSize: number = 50
) {
  const unique = Array.from(new Set(ids.filter(id => Number.isFinite(id) && id > 0)));
  if (unique.length === 0) return {} as Record<number, boolean>;
  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += batchSize) {
    chunks.push(unique.slice(i, i + batchSize));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const url = new URL("/api/v1/availability", window.location.origin);
      url.searchParams.set("type", type);
      url.searchParams.set("ids", chunk.join(","));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return {};
      const body = await res.json();
      return body?.availability ?? {};
    })
  );

  return results.reduce<Record<number, boolean>>((acc, next) => Object.assign(acc, next), {});
}
