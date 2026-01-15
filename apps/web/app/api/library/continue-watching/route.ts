import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getUserByUsername } from "@/db";
import { getJellyfinApiKey, getJellyfinBaseUrl } from "@/lib/jellyfin-admin";
import { getJellyfinExternalBaseUrl } from "@/lib/jellyfin-links";
import { cacheableJsonResponseWithETag, jsonResponseWithETag } from "@/lib/api-optimization";

const TakeSchema = z.coerce.number().int().min(1).max(30).default(12);

type JellyfinResumeItem = {
  Id?: string;
  Name?: string;
  SeriesName?: string;
  Type?: string;
  SeriesId?: string;
  ParentId?: string;
  ImageTags?: { Primary?: string };
  PrimaryImageTag?: string;
  RunTimeTicks?: number;
  UserData?: { PlaybackPositionTicks?: number };
};

export async function GET(req: NextRequest) {
  try {
    const take = TakeSchema.parse(req.nextUrl.searchParams.get("take") ?? undefined);
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const dbUser = await getUserByUsername(user.username);
    if (!dbUser?.jellyfin_user_id) {
      return jsonResponseWithETag(req, { items: [] });
    }
    const baseUrl = await getJellyfinBaseUrl();
    const apiKey = await getJellyfinApiKey();
    const externalBase = await getJellyfinExternalBaseUrl();
    const playBase = externalBase || baseUrl;
    if (!baseUrl || !apiKey || !playBase) {
      return jsonResponseWithETag(req, { items: [] });
    }

    const resumeUrl = new URL(`${baseUrl.replace(/\/+$/, "")}/Users/${dbUser.jellyfin_user_id}/Items/Resume`);
    resumeUrl.searchParams.set("Limit", String(take));
    resumeUrl.searchParams.set("Fields", "ProviderIds,PrimaryImageAspectRatio,SeriesId,SeriesName,ParentId,UserData,RunTimeTicks,ImageTags");
    resumeUrl.searchParams.set("IncludeItemTypes", "Movie,Episode");

    const res = await fetch(resumeUrl.toString(), {
      headers: { "X-Emby-Token": apiKey, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return jsonResponseWithETag(req, { items: [] });
    }
    const payload = await res.json();
    const items: JellyfinResumeItem[] = Array.isArray(payload?.Items) ? payload.Items : [];

    const mapped = items
      .map((item) => {
        const itemId = String(item.Id ?? "");
        if (!itemId) return null;
        const rawType = String(item.Type ?? "").toLowerCase();
        const isMovie = rawType === "movie";
        const isEpisode = rawType === "episode";
        const title = (isMovie ? item.Name : item.SeriesName || item.Name) ?? "Continue Watching";
        // For movies, use the movie's own ID. For episodes, use SeriesId or ParentId to get the series poster
        const imageItemId = isMovie ? itemId : String(item.SeriesId || item.ParentId || item.Id || "");
        const imageTag = item.ImageTags?.Primary ?? item.PrimaryImageTag ?? "";
        const posterUrl = imageItemId
          ? `/imageproxy/jellyfin/Items/${encodeURIComponent(imageItemId)}/Images/Primary?fillWidth=320&quality=85${imageTag ? `&tag=${encodeURIComponent(imageTag)}` : ""}`
          : null;
        const playUrl = `${playBase}/web/index.html#!/details?id=${encodeURIComponent(itemId)}&context=home`;
        const position = item.UserData?.PlaybackPositionTicks ?? 0;
        const runtime = item.RunTimeTicks ?? 0;
        const progress = runtime > 0 ? Math.min(Math.max(position / runtime, 0), 1) : 0;

        return {
          id: itemId,
          title,
          posterUrl,
          playUrl,
          progress,
          type: isMovie ? "movie" : isEpisode ? "episode" : "tv",
        };
      })
      .filter(Boolean);

    return cacheableJsonResponseWithETag(req, { items: mapped }, { maxAge: 10, sMaxAge: 0, private: true });
  } catch {
    return jsonResponseWithETag(req, { items: [] });
  }
}
