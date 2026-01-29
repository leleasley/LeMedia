import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getActiveMediaService } from "@/lib/media-services";
import { createRadarrFetcher, getMovieByTmdbId } from "@/lib/radarr";
import { createSonarrFetcher, getSeriesByTmdbId, getSeriesByTvdbId } from "@/lib/sonarr";
import { mapReleaseToRow } from "@/lib/upgrade-finder";
import { mapProwlarrResultToRow, searchProwlarr } from "@/lib/prowlarr";
import { getMovieExternalIds } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  id: z.coerce.number().int().optional(),
  tmdbId: z.coerce.number().int().optional(),
  tvdbId: z.coerce.number().int().optional(),
  useUpgradeFinder: z.coerce.number().int().optional(),
  preferProwlarr: z.coerce.number().int().optional(),
  title: z.string().trim().max(200).optional(),
  year: z.string().trim().max(4).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50)
}).refine((data) => data.id || data.tmdbId || data.tvdbId || data.title, {
  message: "Missing media identifier"
});

const PROFILE_CACHE_TTL_MS = 2 * 60 * 1000;
let cachedUltraHdProfileId: { id: number; expiresAt: number } | null = null;

async function getUltraHdProfileId(fetcher: (path: string, init?: RequestInit) => Promise<any>) {
  const now = Date.now();
  if (cachedUltraHdProfileId && cachedUltraHdProfileId.expiresAt > now) {
    return cachedUltraHdProfileId.id;
  }
  const profiles = await fetcher("/api/v3/qualityprofile");
  const ultraHdProfile = Array.isArray(profiles)
    ? profiles.find((p: any) => p.name === "Ultra-HD")
    : null;
  if (!ultraHdProfile) return null;
  cachedUltraHdProfileId = { id: ultraHdProfile.id, expiresAt: now + PROFILE_CACHE_TTL_MS };
  return ultraHdProfile.id;
}

function filterProwlarrByIds<T extends { imdbId?: any; tmdbId?: any; tvdbId?: any }>(
  releases: T[],
  ids: { imdbId?: string | null; tmdbId?: number | null; tvdbId?: number | null }
) {
  if (!releases.length) return releases;
  const imdbNumeric = ids.imdbId ? ids.imdbId.replace(/\D/g, "") : "";
  const tmdbId = ids.tmdbId ? String(ids.tmdbId) : "";
  const tvdbId = ids.tvdbId ? String(ids.tvdbId) : "";

  const filtered = releases.filter((release) => {
    const imdbRaw = release?.imdbId ?? (release as any)?.imdbid ?? (release as any)?.imdbID;
    const imdbStr = imdbRaw == null ? "" : String(imdbRaw);
    const imdbDigits = imdbStr.replace(/\D/g, "");
    const tmdbRaw = release?.tmdbId ?? (release as any)?.tmdbID;
    const tvdbRaw = release?.tvdbId ?? (release as any)?.tvdbID;
    const tmdbStr = tmdbRaw == null ? "" : String(tmdbRaw);
    const tvdbStr = tvdbRaw == null ? "" : String(tvdbRaw);

    const imdbMatch = imdbNumeric && (imdbStr === ids.imdbId || imdbDigits === imdbNumeric);
    const tmdbMatch = tmdbId && tmdbStr === tmdbId;
    const tvdbMatch = tvdbId && tvdbStr === tvdbId;
    return imdbMatch || tmdbMatch || tvdbMatch;
  });

  return filtered.length ? filtered : releases;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const parsed = QuerySchema.safeParse({
    mediaType: req.nextUrl.searchParams.get("mediaType"),
    id: req.nextUrl.searchParams.get("id"),
    tmdbId: req.nextUrl.searchParams.get("tmdbId") ?? undefined,
    tvdbId: req.nextUrl.searchParams.get("tvdbId") ?? undefined,
    useUpgradeFinder: req.nextUrl.searchParams.get("useUpgradeFinder") ?? undefined,
    preferProwlarr: req.nextUrl.searchParams.get("preferProwlarr") ?? undefined,
    title: req.nextUrl.searchParams.get("title") ?? undefined,
    year: req.nextUrl.searchParams.get("year") ?? undefined,
    offset: req.nextUrl.searchParams.get("offset") ?? "0",
    limit: req.nextUrl.searchParams.get("limit") ?? "50"
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const { mediaType, id, offset, limit, tmdbId, tvdbId, useUpgradeFinder, preferProwlarr, title, year } = parsed.data;
    const releaseTimeout = 120000;
    let releases: any[] = [];
    let usedProwlarr = false;
    let resolvedId: number | null = typeof id === "number" && Number.isFinite(id) ? id : null;

    if (preferProwlarr) {
      const prowlarrService = await getActiveMediaService("prowlarr").catch(() => null);
      if (!prowlarrService) return NextResponse.json({ error: "No Prowlarr service configured" }, { status: 400 });

      if (mediaType === "movie") {
        const radarrService = await getActiveMediaService("radarr").catch(() => null);
        if (!resolvedId && tmdbId && radarrService) {
          const movie = await getMovieByTmdbId(tmdbId).catch(() => null);
          resolvedId = movie?.id ?? null;
        }
        const imdbId = tmdbId
          ? await getMovieExternalIds(tmdbId).then(res => res?.imdb_id ?? null).catch(() => null)
          : null;
        const searchQueries = [
          imdbId ? `imdb:${imdbId}` : "",
          tmdbId ? `tmdb:${tmdbId}` : "",
          title ? (year ? `${title} ${year}` : title) : ""
        ].filter(Boolean);
        for (const query of searchQueries) {
          releases = await searchProwlarr(query, prowlarrService, releaseTimeout, {
            type: "movie",
            limit: 100
          }).catch(() => []);
          if (releases.length) break;
        }
        releases = filterProwlarrByIds(releases, { imdbId, tmdbId });
      } else {
        const sonarrService = await getActiveMediaService("sonarr").catch(() => null);
        if (!resolvedId && (tvdbId || tmdbId) && sonarrService) {
          const byTvdb = tvdbId ? await getSeriesByTvdbId(tvdbId).catch(() => null) : null;
          const byTmdb = !byTvdb && tmdbId ? await getSeriesByTmdbId(tmdbId).catch(() => null) : null;
          resolvedId = (byTvdb ?? byTmdb)?.id ?? null;
        }
        const searchQueries = [
          tvdbId ? `tvdb:${tvdbId}` : "",
          tmdbId ? `tmdb:${tmdbId}` : "",
          title ? title : ""
        ].filter(Boolean);
        for (const query of searchQueries) {
          releases = await searchProwlarr(query, prowlarrService, releaseTimeout, {
            type: "tv",
            limit: 100
          }).catch(() => []);
          if (releases.length) break;
        }
        releases = filterProwlarrByIds(releases, { tmdbId, tvdbId });
      }

      if (!releases.length && title) {
        const fallbackQuery = year ? `${title} ${year}` : title;
        releases = await searchProwlarr(fallbackQuery, prowlarrService, releaseTimeout, {
          type: mediaType,
          limit: 100
        }).catch(() => []);
      }

      usedProwlarr = true;
    } else if (mediaType === "movie") {
      const service = await getActiveMediaService("radarr").catch(() => null);

      if (service) {
        const fetcher = createRadarrFetcher(service.base_url, service.apiKey, releaseTimeout);

        // Try to resolve the movie ID if we have tmdbId but no resolvedId
        if (!resolvedId && tmdbId) {
          const movie = await getMovieByTmdbId(tmdbId).catch(() => null);
          resolvedId = movie?.id ?? null;
        }

        // If we have a resolvedId (movie is in Radarr), search by movieId
        if (resolvedId) {
          if (useUpgradeFinder) {
            const movie = await fetcher(`/api/v3/movie/${resolvedId}`);
            const originalProfileId = movie?.qualityProfileId ?? null;
            const ultraHdProfileId = await getUltraHdProfileId(fetcher);
            let restoredProfile = false;
            try {
              if (ultraHdProfileId && originalProfileId && originalProfileId !== ultraHdProfileId) {
                await fetcher(`/api/v3/movie/${resolvedId}`, {
                  method: "PUT",
                  body: JSON.stringify({
                    ...movie,
                    qualityProfileId: ultraHdProfileId
                  })
                });
              }
              const response = await fetcher(`/api/v3/release?movieId=${resolvedId}`);
              releases = Array.isArray(response) ? response : [];
              if (ultraHdProfileId && originalProfileId && originalProfileId !== ultraHdProfileId) {
                await fetcher(`/api/v3/movie/${resolvedId}`, {
                  method: "PUT",
                  body: JSON.stringify({
                    ...movie,
                    qualityProfileId: originalProfileId
                  })
                });
                restoredProfile = true;
              }
            } catch {
              if (ultraHdProfileId && originalProfileId && originalProfileId !== ultraHdProfileId && !restoredProfile) {
                try {
                  await fetcher(`/api/v3/movie/${resolvedId}`, {
                    method: "PUT",
                    body: JSON.stringify({
                      ...movie,
                      qualityProfileId: originalProfileId
                    })
                  });
                } catch {
                  // ignore restore errors
                }
              }
              throw new Error("Failed to load releases");
            }
          } else {
            const response = await fetcher(`/api/v3/release?movieId=${resolvedId}`);
            releases = Array.isArray(response) ? response : [];
          }
        }
        // Movie not in Radarr - try searching by tmdbId
        else if (tmdbId && !releases.length) {
          const response = await fetcher(`/api/v3/release?term=${encodeURIComponent(`tmdb:${tmdbId}`)}`);
          releases = Array.isArray(response) ? response : [];
        }

        // If still no releases and we have a title, try title search in Radarr
        if (!releases.length && title) {
          const response = await fetcher(`/api/v3/release?term=${encodeURIComponent(title)}`);
          releases = Array.isArray(response) ? response : [];
        }
      }
    } else {
      const service = await getActiveMediaService("sonarr").catch(() => null);

      if (service) {
        const fetcher = createSonarrFetcher(service.base_url, service.apiKey, releaseTimeout);

        // Try to resolve the series ID if we have tvdbId/tmdbId but no resolvedId
        if (!resolvedId && (tvdbId || tmdbId)) {
          const byTvdb = tvdbId ? await getSeriesByTvdbId(tvdbId).catch(() => null) : null;
          const byTmdb = !byTvdb && tmdbId ? await getSeriesByTmdbId(tmdbId).catch(() => null) : null;
          resolvedId = (byTvdb ?? byTmdb)?.id ?? null;
        }

        // If we have a resolvedId (series is in Sonarr), search by seriesId
        if (resolvedId) {
          const response = await fetcher(`/api/v3/release?seriesId=${resolvedId}`);
          releases = Array.isArray(response) ? response : [];
        }
        // Series not in Sonarr - try searching by tvdbId or tmdbId
        else if (tvdbId || tmdbId) {
          const term = tvdbId ? `tvdb:${tvdbId}` : `tmdb:${tmdbId}`;
          const response = await fetcher(`/api/v3/release?term=${encodeURIComponent(term)}`);
          releases = Array.isArray(response) ? response : [];
        }

        // If still no releases and we have a title, try title search in Sonarr
        if (!releases.length && title) {
          const response = await fetcher(`/api/v3/release?term=${encodeURIComponent(title)}`);
          releases = Array.isArray(response) ? response : [];
        }
      }
    }

    // If Radarr/Sonarr returned no results or isn't configured, fall back to Prowlarr
    if (!releases.length && title) {
      const prowlarrService = await getActiveMediaService("prowlarr").catch(() => null);
      if (prowlarrService) {
        // Include year in search query for better results
        const searchQuery = year ? `${title} ${year}` : title;
        releases = await searchProwlarr(searchQuery, prowlarrService, releaseTimeout, {
          type: mediaType,
          limit: 100
        }).catch(() => []);
        usedProwlarr = Array.isArray(releases) && releases.length > 0;
      }
    }

    const items = usedProwlarr ? releases.map(mapProwlarrResultToRow) : releases.map(mapReleaseToRow);
    const total = items.length;
    const start = offset;
    const end = start + limit;

    return NextResponse.json({
      items: items.slice(start, end),
      total,
      offset,
      limit,
      resolvedId
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load releases" }, { status: 500 });
  }
}
