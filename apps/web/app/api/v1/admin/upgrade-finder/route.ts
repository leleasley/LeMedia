import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { listUpgradeFinderItems } from "@/lib/upgrade-finder";
import { getActiveMediaService } from "@/lib/media-services";
import { createRadarrFetcher } from "@/lib/radarr";
import { createSonarrFetcher } from "@/lib/sonarr";

const actionSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  id: z.number().int(),
  mode: z.enum(["search", "check"]).optional()
});

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const [items, radarrService, sonarrService] = await Promise.all([
    listUpgradeFinderItems(),
    getActiveMediaService("radarr").catch(() => null),
    getActiveMediaService("sonarr").catch(() => null)
  ]);

  const radarrUiBase = (radarrService?.config as any)?.externalUrl ?? radarrService?.base_url ?? "";
  const sonarrUiBase = (sonarrService?.config as any)?.externalUrl ?? sonarrService?.base_url ?? "";

  const itemsWithLinks = items.map(item => {
    if (item.mediaType === "movie" && radarrUiBase) {
      return { ...item, interactiveUrl: `${radarrUiBase.replace(/\/+$/, "")}/#/movie/${item.id}/interactive` };
    }
    if (item.mediaType === "tv" && sonarrUiBase) {
      return { ...item, interactiveUrl: `${sonarrUiBase.replace(/\/+$/, "")}/#/series/${item.id}/search` };
    }
    return item;
  });

  return jsonResponseWithETag(req, { items: itemsWithLinks });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const { mediaType, id, mode } = parsed.data;

  try {
    if (mediaType === "movie") {
      const service = await getActiveMediaService("radarr");
      if (!service) return NextResponse.json({ error: "No Radarr service configured" }, { status: 400 });
      const fetcher = createRadarrFetcher(service.base_url, service.apiKey);
      if (mode === "check") {
        const releases = await fetcher(`/api/v3/release?movieId=${id}`);
        const normalized = Array.isArray(releases) ? releases : [];
        const hint = normalized.find((rel: any) => {
          const name = `${rel?.quality?.quality?.name ?? rel?.quality?.name ?? ""}`.toLowerCase();
          return name.includes("2160") || name.includes("4k");
        });
        return NextResponse.json({
          ok: true,
          hint: hint ? "4K available" : "No 4K found",
          count: normalized.length
        });
      }
      await fetcher("/api/v3/command", {
        method: "POST",
        body: JSON.stringify({ name: "MoviesSearch", movieIds: [id] })
      });
      return NextResponse.json({ ok: true, message: "Radarr search triggered" });
    }

    const service = await getActiveMediaService("sonarr");
    if (!service) return NextResponse.json({ error: "No Sonarr service configured" }, { status: 400 });
    const fetcher = createSonarrFetcher(service.base_url, service.apiKey);
    if (mode === "check") {
      const releases = await fetcher(`/api/v3/release?seriesId=${id}`);
      const normalized = Array.isArray(releases) ? releases : [];
      const hint = normalized.find((rel: any) => {
        const name = `${rel?.quality?.quality?.name ?? rel?.quality?.name ?? ""}`.toLowerCase();
        return name.includes("2160") || name.includes("4k");
      });
      return NextResponse.json({
        ok: true,
        hint: hint ? "4K available" : "No 4K found",
        count: normalized.length
      });
    }
    await fetcher("/api/v3/command", {
      method: "POST",
      body: JSON.stringify({ name: "SeriesSearch", seriesId: id })
    });
    return NextResponse.json({ ok: true, message: "Sonarr search triggered" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to trigger search" }, { status: 500 });
  }
}
