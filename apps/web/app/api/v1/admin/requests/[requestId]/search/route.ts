import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getRequestWithItems } from "@/db";
import { episodeSearch, getEpisodesForSeries } from "@/lib/sonarr";

type ParamsInput = { requestId: string } | Promise<{ requestId: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ requestId: string }>);
  return params as { requestId: string };
}

export async function POST(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { requestId } = await resolveParams(params);
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const data = await getRequestWithItems(requestId);
  if (!data) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (data.request.request_type !== "episode") {
    return NextResponse.json({ error: "Only episode requests can be searched" }, { status: 400 });
  }

  const seriesId = data.items.find(item => item.provider === "sonarr")?.provider_id;
  if (!seriesId) {
    return NextResponse.json({
      error: "Series not linked in Sonarr",
      suggestNoFiles: true
    }, { status: 400 });
  }

  const episodes = await getEpisodesForSeries(seriesId).catch(() => []);
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return NextResponse.json({
      message: "No files available in Sonarr for these episodes.",
      suggestNoFiles: true
    });
  }
  const requestedEpisodeIds = data.items
    .filter(item => item.provider === "sonarr" && item.season != null && item.episode != null)
    .map(item => {
      return episodes.find(
        (ep: any) => ep.seasonNumber === item.season && ep.episodeNumber === item.episode
      );
    })
    .filter(Boolean)
    .map((ep: any) => ep.id);

  if (!requestedEpisodeIds.length) {
    return NextResponse.json({
      message: "No files available in Sonarr for these episodes.",
      suggestNoFiles: true
    });
  }

  await episodeSearch(requestedEpisodeIds).catch(() => null);

  return NextResponse.json({ message: "Sonarr episode search started" });
}
