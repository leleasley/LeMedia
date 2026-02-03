import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getActiveMediaService } from "@/lib/media-services";
import { createRadarrFetcher } from "@/lib/radarr";
import { createSonarrFetcher } from "@/lib/sonarr";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  id: z.coerce.number().int()
});

function pickTopQuality(files: any[]) {
  const counts = new Map<string, number>();
  files.forEach((file) => {
    const name = String(file?.quality?.quality?.name ?? file?.quality?.name ?? "").trim();
    if (!name) return;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of counts.entries()) {
    if (!best || count > best.count) best = { name, count };
  }
  return best?.name ?? null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const parsed = QuerySchema.safeParse({
    mediaType: req.nextUrl.searchParams.get("mediaType"),
    id: req.nextUrl.searchParams.get("id")
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const { mediaType, id } = parsed.data;

    if (mediaType === "movie") {
      const service = await getActiveMediaService("radarr");
      if (!service) return NextResponse.json({ error: "No Radarr service configured" }, { status: 400 });
      const fetcher = createRadarrFetcher(service.base_url, service.apiKey);
      const movie = await fetcher(`/api/v3/movie/${id}`);
      const movieFile = movie?.movieFile ?? null;
      const quality = movieFile?.quality?.quality?.name ?? movieFile?.quality?.name ?? null;
      const sizeBytes = movieFile?.size ?? movieFile?.sizeBytes ?? null;
      const dateAdded = movieFile?.dateAdded ?? null;
      return NextResponse.json({
        mediaType,
        id,
        quality: quality || null,
        sizeBytes: typeof sizeBytes === "number" ? sizeBytes : null,
        dateAdded: typeof dateAdded === "string" ? dateAdded : null,
        hasFile: Boolean(movieFile?.id)
      });
    }

    const service = await getActiveMediaService("sonarr");
    if (!service) return NextResponse.json({ error: "No Sonarr service configured" }, { status: 400 });
    const fetcher = createSonarrFetcher(service.base_url, service.apiKey);
    const series = await fetcher(`/api/v3/series/${id}`);
    const stats = series?.statistics ?? {};
    const monitored = series?.monitored ?? null;
    const seriesType = series?.seriesType ?? null;
    const sizeBytes = stats?.sizeOnDisk ?? series?.sizeOnDisk ?? null;
    let files: any[] = [];
    try {
      const response = await fetcher(`/api/v3/episodefile?seriesId=${id}`);
      files = Array.isArray(response) ? response : [];
    } catch {
      files = [];
    }
    const quality = pickTopQuality(files);
    const episodeFileCount = typeof stats?.episodeFileCount === "number" ? stats.episodeFileCount : null;

    return NextResponse.json({
      mediaType,
      id,
      quality: quality || null,
      sizeBytes: typeof sizeBytes === "number" ? sizeBytes : null,
      episodeFileCount,
      monitored: typeof monitored === "boolean" ? monitored : null,
      seriesType: typeof seriesType === "string" ? seriesType : null
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load media info" }, { status: 500 });
  }
}
