import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { getTv, getTvSeason } from "@/lib/tmdb";
import { pickTrailerUrl, resolvePlayableTrailer } from "@/lib/trailer-utils";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

export async function GET(_req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await getUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid TV show" }, { status: 400 });
  }

  const tvId = parsed.data.id;
  const includeFallbacks = _req.nextUrl.searchParams.get("includeFallbacks") === "1";
  const tv = await getTv(tvId).catch(() => null);
  if (!tv) {
    return NextResponse.json({ error: "TV show not found" }, { status: 404 });
  }

  const seriesTitle = String(tv.name ?? tv.original_name ?? `TV ${tvId}`);
  const seriesYear = Number.parseInt(String(tv.first_air_date ?? "").slice(0, 4), 10);
  const seriesQueries = [
    `${JSON.stringify(seriesTitle)} official trailer ${Number.isFinite(seriesYear) ? seriesYear : ""}`.trim(),
    `${JSON.stringify(seriesTitle)} trailer ${Number.isFinite(seriesYear) ? seriesYear : ""}`.trim(),
    `${JSON.stringify(seriesTitle)} official teaser ${Number.isFinite(seriesYear) ? seriesYear : ""}`.trim(),
    `${JSON.stringify(seriesTitle)} teaser ${Number.isFinite(seriesYear) ? seriesYear : ""}`.trim(),
    `${seriesTitle} official trailer ${Number.isFinite(seriesYear) ? seriesYear : ""}`.trim(),
    `${seriesTitle} trailer ${Number.isFinite(seriesYear) ? seriesYear : ""}`.trim(),
    `${seriesTitle} official teaser ${Number.isFinite(seriesYear) ? seriesYear : ""}`.trim(),
    `${seriesTitle} teaser ${Number.isFinite(seriesYear) ? seriesYear : ""}`.trim(),
  ];
  const preferredSeriesTrailerUrl = pickTrailerUrl(tv);
  const initialSeriesTrailer = await resolvePlayableTrailer({
    preferredUrl: preferredSeriesTrailerUrl,
    queries: [],
  });
  const seriesTrailer = !initialSeriesTrailer.url && includeFallbacks
    ? await resolvePlayableTrailer({
        preferredUrl: preferredSeriesTrailerUrl,
        queries: seriesQueries,
      })
    : initialSeriesTrailer;

  const seasons = Array.isArray(tv.seasons)
    ? tv.seasons
      .filter((season: any) => Number(season?.season_number ?? 0) > 0)
      .sort((left: any, right: any) => Number(left?.season_number ?? 0) - Number(right?.season_number ?? 0))
    : [];

  const seasonResults = await Promise.all(
    seasons.map(async (season: any) => {
      const seasonNumber = Number(season?.season_number ?? 0);
      const details = await getTvSeason(tvId, seasonNumber).catch(() => null);
      const seasonName = String(details?.name ?? season?.name ?? `Season ${seasonNumber}`);
      const alternateSeasonName = seasonName
        .replace(/^series\s+/i, "Season ")
        .replace(/^season\s+/i, "Series ");
      const seasonYear = Number.parseInt(String(details?.air_date ?? season?.air_date ?? "").slice(0, 4), 10);
      const seasonQueries = [
        `${JSON.stringify(seriesTitle)} ${JSON.stringify(seasonName)} official trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} season ${seasonNumber} official trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} series ${seasonNumber} official trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} ${JSON.stringify(seasonName)} official teaser ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} season ${seasonNumber} official teaser ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} series ${seasonNumber} official teaser ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} ${JSON.stringify(seasonName)} trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} season ${seasonNumber} trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} series ${seasonNumber} trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} ${JSON.stringify(seasonName)} teaser ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} season ${seasonNumber} teaser ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${JSON.stringify(seriesTitle)} series ${seasonNumber} teaser ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${seriesTitle} ${seasonName} official trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${seriesTitle} season ${seasonNumber} official trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${seriesTitle} series ${seasonNumber} official trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${seriesTitle} ${alternateSeasonName} official trailer ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${seriesTitle} ${seasonName} official teaser ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${seriesTitle} ${alternateSeasonName} official teaser ${Number.isFinite(seasonYear) ? seasonYear : ""}`.trim(),
        `${seriesTitle} ${seasonName} trailer`.trim(),
        `${seriesTitle} ${alternateSeasonName} trailer`.trim(),
        `${seriesTitle} season ${seasonNumber} trailer`.trim(),
        `${seriesTitle} series ${seasonNumber} trailer`.trim(),
        `${seriesTitle} s${seasonNumber} trailer`.trim(),
        `${seriesTitle} ${seasonName} teaser`.trim(),
        `${seriesTitle} ${alternateSeasonName} teaser`.trim(),
        `${seriesTitle} season ${seasonNumber} teaser`.trim(),
        `${seriesTitle} series ${seasonNumber} teaser`.trim(),
        `${seriesTitle} s${seasonNumber} teaser`.trim(),
      ];
      const preferredSeasonTrailerUrl = details ? pickTrailerUrl(details) : null;
      const initialResolvedTrailer = await resolvePlayableTrailer({
        preferredUrl: preferredSeasonTrailerUrl,
        queries: [],
      });
      const resolvedTrailer = !initialResolvedTrailer.url && includeFallbacks
        ? await resolvePlayableTrailer({
            preferredUrl: preferredSeasonTrailerUrl,
            queries: seasonQueries,
          })
        : initialResolvedTrailer;
      const trailerUrl = resolvedTrailer.url;
      if (!trailerUrl && !includeFallbacks) {
        return {
          seasonNumber,
          name: seasonName,
          trailerUrl: null,
          hadPreferredTrailer: Boolean(preferredSeasonTrailerUrl),
        };
      }
      if (!trailerUrl) return null;
      return {
        seasonNumber,
        name: seasonName,
        trailerUrl,
        hadPreferredTrailer: Boolean(preferredSeasonTrailerUrl),
      };
    })
  );

  const allSeasonResults = seasonResults.filter(Boolean);
  const filteredSeasons = allSeasonResults.filter((season) => Boolean(season.trailerUrl));
  const pendingFallbackCount =
    (!seriesTrailer.url ? 1 : 0) +
    allSeasonResults.filter((season) => !season.trailerUrl).length;
  const pendingIssueFallbackCount =
    (!seriesTrailer.url && preferredSeriesTrailerUrl ? 1 : 0) +
    allSeasonResults.filter((season) => !season.trailerUrl && season.hadPreferredTrailer).length;

  return NextResponse.json({
    seriesTrailerUrl: seriesTrailer.url,
    pendingFallbackCount,
    pendingIssueFallbackCount,
    seasons: filteredSeasons,
  });
}