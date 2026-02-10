import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { listUpgradeFinderItems, checkUpgradeHintForItem } from "@/lib/upgrade-finder";
import { getActiveMediaService } from "@/lib/media-services";
import { createRadarrFetcher } from "@/lib/radarr";
import { listUpgradeFinderHints, listUpgradeFinderOverrides, upsertUpgradeFinderOverride } from "@/db";

const actionSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  id: z.number().int(),
  mode: z.enum(["search", "check", "ignore"]).optional(),
  ignore4k: z.boolean().optional()
});

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const [items, hints, overrides, radarrService] = await Promise.all([
    listUpgradeFinderItems(),
    listUpgradeFinderHints().catch(() => []),
    listUpgradeFinderOverrides().catch(() => []),
    getActiveMediaService("radarr").catch(() => null)
  ]);

  const radarrUiBase = (radarrService?.config as any)?.externalUrl ?? radarrService?.base_url ?? "";
  const hintMap = new Map(
    hints.map(hint => [`${hint.mediaType}:${hint.mediaId}`, hint])
  );
  const overrideMap = new Map(
    overrides.map(override => [`${override.mediaType}:${override.mediaId}`, override])
  );

  const itemsWithLinks = items.map(item => {
    const hint = hintMap.get(`${item.mediaType}:${item.id}`);
    const override = overrideMap.get(`${item.mediaType}:${item.id}`);
    // All items are movies now
    if (radarrUiBase) {
      return {
        ...item,
        hintStatus: hint?.status ?? undefined,
        hintText: hint?.hintText ?? null,
        checkedAt: hint?.checkedAt ?? null,
        ignore4k: override?.ignore4k ?? false,
        interactiveUrl: `${radarrUiBase.replace(/\/+$/, "")}/#/movie/${item.id}/interactive`
      };
    }
    return {
      ...item,
      hintStatus: hint?.status ?? undefined,
      hintText: hint?.hintText ?? null,
      checkedAt: hint?.checkedAt ?? null,
      ignore4k: override?.ignore4k ?? false
    };
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
    console.warn("[API] Invalid upgrade-finder payload", { issues: parsed.error.issues });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { mediaType, id, mode, ignore4k } = parsed.data;

  // Only movies are supported
  if (mediaType !== "movie") {
    return NextResponse.json({ error: "Only movies are supported for upgrade finder" }, { status: 400 });
  }

  try {
    if (mode === "ignore") {
      await upsertUpgradeFinderOverride({
        mediaType,
        mediaId: id,
        ignore4k: !!ignore4k
      });
      return NextResponse.json({ ok: true, ignore4k: !!ignore4k });
    }

    const service = await getActiveMediaService("radarr");
    if (!service) return NextResponse.json({ error: "No Radarr service configured" }, { status: 400 });
    const fetcher = createRadarrFetcher(service.base_url, service.apiKey);

    if (mode === "check") {
      const result = await checkUpgradeHintForItem("movie", id);
      return NextResponse.json({ ok: true, hint: result.hintText, status: result.status, count: result.count });
    }

    await fetcher("/api/v3/command", {
      method: "POST",
      body: JSON.stringify({ name: "MoviesSearch", movieIds: [id] })
    });
    return NextResponse.json({ ok: true, message: "Radarr search triggered" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to trigger search" }, { status: 500 });
  }
}
