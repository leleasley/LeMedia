import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getActiveMediaService } from "@/lib/media-services";
import { createRadarrFetcher, getMovieByTmdbId } from "@/lib/radarr";
import { createSonarrFetcher, getSeriesByTmdbId, getSeriesByTvdbId } from "@/lib/sonarr";
import { mapReleaseToRow } from "@/lib/upgrade-finder";
import { mapProwlarrResultToRow, searchProwlarr } from "@/lib/prowlarr";
import { getMovieExternalIds } from "@/lib/tmdb";
import { logger } from "@/lib/logger";

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
  seasonNumber: z.coerce.number().int().min(0).optional(),
  episodeNumber: z.coerce.number().int().min(0).optional(),
  airDate: z.string().trim().max(16).optional(),
  seriesType: z.string().trim().max(50).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50)
}).refine((data) => data.id || data.tmdbId || data.tvdbId || data.title, {
  message: "Missing media identifier"
});

const PROFILE_CACHE_TTL_MS = 2 * 60 * 1000;
let cachedUltraHdProfileId: { id: number; expiresAt: number } | null = null;
const RELEASE_CACHE_TTL_MS = 60 * 1000;
const releaseCache = new Map<string, { expiresAt: number; payload: any }>();

function padEpisode(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "00";
  return String(value).padStart(2, "0");
}

function normalizeSeriesType(value?: string | null) {
  return value ? String(value).toLowerCase() : null;
}

function buildEpisodeSearchTerm(input: {
  title?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  airDate?: string | null;
  seriesType?: string | null;
}) {
  const safeTitle = input.title?.trim();
  if (!safeTitle) return "";
  const seriesType = normalizeSeriesType(input.seriesType);
  if (seriesType === "daily" && input.airDate) {
    return `${safeTitle} ${input.airDate}`.trim();
  }
  if (typeof input.seasonNumber === "number" && typeof input.episodeNumber === "number") {
    const season = padEpisode(input.seasonNumber);
    const episode = padEpisode(input.episodeNumber);
    return `${safeTitle} S${season}E${episode}`.trim();
  }
  // Season pack search (season number but no episode number)
  if (typeof input.seasonNumber === "number") {
    const season = padEpisode(input.seasonNumber);
    return `${safeTitle} S${season}`.trim();
  }
  return safeTitle;
}

function buildSeasonPackSearchTerm(input: { title?: string | null; seasonNumber?: number | null }) {
  const safeTitle = input.title?.trim();
  if (!safeTitle) return "";
  if (typeof input.seasonNumber === "number" && input.seasonNumber > 0) {
    return `${safeTitle} S${padEpisode(input.seasonNumber)}`.trim();
  }
  return `${safeTitle} complete series`.trim();
}

function buildSeasonPackAltTerms(input: { title?: string | null; seasonNumber?: number | null }) {
  const safeTitle = input.title?.trim();
  if (!safeTitle) return [];
  if (typeof input.seasonNumber === "number" && input.seasonNumber > 0) {
    return [
      `${safeTitle} Season ${input.seasonNumber}`,
      `${safeTitle} season pack`
    ];
  }
  return [
    `${safeTitle} complete`,
    `${safeTitle} season pack`
  ];
}

function isSingleEpisodeTitle(title: string) {
  const singleEpisode = /\bS\d{1,2}E\d{2}\b/i.test(title);
  if (!singleEpisode) return false;
  const episodeRange =
    /\bS\d{1,2}E\d{2}\s*[-~]\s*E?\d{2}\b/i.test(title) ||
    /\bE\d{2}\s*[-~]\s*E?\d{2}\b/i.test(title);
  return !episodeRange;
}

function isLikelySeasonPackTitle(title: string, seasonNumber?: number | null) {
  const normalized = title.toLowerCase();
  if (isSingleEpisodeTitle(title)) return false;

  const hasPackKeyword = /(season pack|complete|collection|boxset|all seasons|complete series|full series|series complete)/i.test(normalized);
  const hasMultiSeasonRange =
    /\bS\d{1,2}\s*[-–]\s*S?\d{1,2}\b/i.test(title) ||
    /\bSeason\s*\d+\s*[-–]\s*\d+\b/i.test(title);

  if (typeof seasonNumber === "number" && seasonNumber > 0) {
    const seasonPadded = String(seasonNumber).padStart(2, "0");
    const hasSeasonTag =
      new RegExp(`\\bS${seasonPadded}\\b`, "i").test(title) ||
      new RegExp(`\\bS${seasonNumber}\\b`, "i").test(title) ||
      new RegExp(`\\bSeason\\s*${seasonNumber}\\b`, "i").test(title);
    return hasSeasonTag || hasPackKeyword || hasMultiSeasonRange;
  }

  // Complete/multi-season packs
  return hasPackKeyword || hasMultiSeasonRange;
}

function filterSeasonPackReleases(releases: any[], seasonNumber?: number | null) {
  if (!Array.isArray(releases) || releases.length === 0) return releases;
  const filtered = releases.filter((release) => {
    const title = String(release?.title ?? release?.releaseTitle ?? "");
    if (!title) return false;
    return isLikelySeasonPackTitle(title, seasonNumber);
  });
  return filtered.length ? filtered : releases;
}

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
    seasonNumber: req.nextUrl.searchParams.get("seasonNumber") ?? undefined,
    episodeNumber: req.nextUrl.searchParams.get("episodeNumber") ?? undefined,
    airDate: req.nextUrl.searchParams.get("airDate") ?? undefined,
    seriesType: req.nextUrl.searchParams.get("seriesType") ?? undefined,
    offset: req.nextUrl.searchParams.get("offset") ?? "0",
    limit: req.nextUrl.searchParams.get("limit") ?? "50"
  });

  if (!parsed.success) {
    logger.warn("[API] Invalid media releases query", { issues: parsed.error.issues });
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const cacheKey = req.nextUrl.searchParams.toString();
    const cached = cacheKey ? releaseCache.get(cacheKey) : null;
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    const {
      mediaType,
      id,
      offset,
      limit,
      tmdbId,
      tvdbId,
      useUpgradeFinder,
      preferProwlarr,
      title,
      year,
      seasonNumber,
      episodeNumber,
      airDate,
      seriesType: requestedSeriesType
    } = parsed.data;
    const releaseTimeout = 120000;
    let releases: any[] = [];
    let usedProwlarr = false;
    let resolvedId: number | null = typeof id === "number" && Number.isFinite(id) ? id : null;
    const yearNumber = year ? Number.parseInt(year, 10) : null;
    const hasEpisodeSearch = mediaType === "tv" && typeof seasonNumber === "number" && typeof episodeNumber === "number";
    const hasSeasonPackSearch = mediaType === "tv" && typeof seasonNumber === "number" && typeof episodeNumber !== "number";

    const radarrService = mediaType === "movie"
      ? await getActiveMediaService("radarr").catch(() => null)
      : null;
    const sonarrService = mediaType === "tv"
      ? await getActiveMediaService("sonarr").catch(() => null)
      : null;

    if (mediaType === "movie" && !resolvedId && tmdbId && radarrService) {
      const movie = await getMovieByTmdbId(tmdbId).catch(() => null);
      resolvedId = movie?.id ?? null;
    }
    if (mediaType === "tv" && !resolvedId && (tvdbId || tmdbId) && sonarrService) {
      const byTvdb = tvdbId ? await getSeriesByTvdbId(tvdbId).catch(() => null) : null;
      const byTmdb = !byTvdb && tmdbId ? await getSeriesByTmdbId(tmdbId).catch(() => null) : null;
      resolvedId = (byTvdb ?? byTmdb)?.id ?? null;
    }

    const shouldUseProwlarr = Boolean(preferProwlarr && (hasSeasonPackSearch || !resolvedId));

    if (shouldUseProwlarr) {
      const prowlarrService = await getActiveMediaService("prowlarr").catch(() => null);
      if (!prowlarrService) return NextResponse.json({ error: "No Prowlarr service configured" }, { status: 400 });

      if (mediaType === "movie") {
        const imdbId = tmdbId
          ? await getMovieExternalIds(tmdbId).then(res => res?.imdb_id ?? null).catch(() => null)
          : null;
        const searchQueries = [
          imdbId ? `imdb:${imdbId}` : "",
          tmdbId ? `tmdb:${tmdbId}` : "",
          title ? (year ? `${title} ${year}` : title) : ""
        ].filter(Boolean);
        let usedTitleSearch = false;
        for (const query of searchQueries) {
          releases = await searchProwlarr(query, prowlarrService, releaseTimeout, {
            type: "movie",
            limit: 100
          }).catch(() => []);
          if (releases.length) {
            usedTitleSearch = !query.startsWith("imdb:") && !query.startsWith("tmdb:");
            break;
          }
        }
        if (usedTitleSearch) {
          releases = filterProwlarrByIds(releases, { imdbId, tmdbId });
        }
      } else {
        const episodeTerm = hasEpisodeSearch
          ? buildEpisodeSearchTerm({
              title,
              seasonNumber,
              episodeNumber,
              airDate: airDate ?? null,
              seriesType: requestedSeriesType ?? null
            })
          : "";
        const seasonPackTerm = hasSeasonPackSearch
          ? buildSeasonPackSearchTerm({ title, seasonNumber })
          : "";
        const seasonPackAltTerms = hasSeasonPackSearch
          ? buildSeasonPackAltTerms({ title, seasonNumber })
          : [];
        const searchQueries = [
          episodeTerm,
          seasonPackTerm,
          ...seasonPackAltTerms,
          tvdbId ? `tvdb:${tvdbId}` : "",
          tmdbId ? `tmdb:${tmdbId}` : "",
          title ? title : ""
        ].filter(Boolean);
        let usedTitleSearch = false;
        for (const query of searchQueries) {
          releases = await searchProwlarr(query, prowlarrService, releaseTimeout, {
            type: "tv",
            limit: 100
          }).catch(() => []);
          if (releases.length) {
            usedTitleSearch = !query.startsWith("tvdb:") && !query.startsWith("tmdb:");
            break;
          }
        }
        if (usedTitleSearch) {
          releases = filterProwlarrByIds(releases, { tmdbId, tvdbId });
        }
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
      const service = radarrService;

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
      const service = sonarrService;

      if (service) {
        const fetcher = createSonarrFetcher(service.base_url, service.apiKey, releaseTimeout);
        let resolvedSeriesType: string | null = normalizeSeriesType(requestedSeriesType);

        // Try to resolve the series ID if we have tvdbId/tmdbId but no resolvedId
        if (!resolvedId && (tvdbId || tmdbId)) {
          const byTvdb = tvdbId ? await getSeriesByTvdbId(tvdbId).catch(() => null) : null;
          const byTmdb = !byTvdb && tmdbId ? await getSeriesByTmdbId(tmdbId).catch(() => null) : null;
          resolvedId = (byTvdb ?? byTmdb)?.id ?? null;
          const seriesType = (byTvdb ?? byTmdb)?.seriesType ?? null;
          if (!resolvedSeriesType && seriesType) resolvedSeriesType = normalizeSeriesType(seriesType);
        }

        if (resolvedId && !resolvedSeriesType) {
          try {
            const series = await fetcher(`/api/v3/series/${resolvedId}`);
            if (series?.seriesType) resolvedSeriesType = normalizeSeriesType(series.seriesType);
          } catch {
            // ignore series type errors
          }
        }

        // If we have a resolvedId (series is in Sonarr), search by episode or series
        if (resolvedId) {
          if (hasEpisodeSearch) {
            try {
              const episodes = await fetcher(`/api/v3/episode?seriesId=${resolvedId}`);
              const episodeList = Array.isArray(episodes) ? episodes : [];
              const matched = episodeList.find((episode: any) =>
                Number(episode?.seasonNumber) === Number(seasonNumber) &&
                Number(episode?.episodeNumber) === Number(episodeNumber)
              );
              if (matched?.id) {
                const response = await fetcher(`/api/v3/release?episodeId=${matched.id}`);
                releases = Array.isArray(response) ? response : [];
              }
            } catch {
              // ignore episode lookup errors
            }
          }

          if (!releases.length && !hasSeasonPackSearch) {
            const response = await fetcher(`/api/v3/release?seriesId=${resolvedId}`);
            releases = Array.isArray(response) ? response : [];
          }
        }
        // Series not in Sonarr - try searching by tvdbId or tmdbId
        else if (tvdbId || tmdbId) {
          const term = tvdbId ? `tvdb:${tvdbId}` : `tmdb:${tmdbId}`;
          const response = await fetcher(`/api/v3/release?term=${encodeURIComponent(term)}`);
          releases = Array.isArray(response) ? response : [];
        }

        // If still no releases and we have a title, try title/episode search in Sonarr
        if (!releases.length && title) {
          // For season pack searches, include season/pack hints to avoid single-episode noise
          const searchTerm = hasEpisodeSearch
            ? buildEpisodeSearchTerm({
                title,
                seasonNumber,
                episodeNumber,
                airDate: airDate ?? null,
                seriesType: resolvedSeriesType
              })
            : (hasSeasonPackSearch
              ? buildSeasonPackSearchTerm({ title, seasonNumber })
              : title);
          if (searchTerm) {
            const response = await fetcher(`/api/v3/release?term=${encodeURIComponent(searchTerm)}`);
            releases = Array.isArray(response) ? response : [];
          }
        }
      }
    }

    // If Radarr/Sonarr returned no results or isn't configured, fall back to Prowlarr
    if (!releases.length && title) {
      const prowlarrService = await getActiveMediaService("prowlarr").catch(() => null);
      if (prowlarrService) {
        // For season pack searches, use title only to get all season releases
        const searchQuery = hasEpisodeSearch
          ? buildEpisodeSearchTerm({
              title,
              seasonNumber,
              episodeNumber,
              airDate: airDate ?? null,
              seriesType: requestedSeriesType ?? null
            })
          : (hasSeasonPackSearch
            ? (seasonNumber && seasonNumber > 0
              ? `${title} S${padEpisode(seasonNumber)}`
              : `${title} complete series`)
            : (year ? `${title} ${year}` : title));
        releases = await searchProwlarr(searchQuery, prowlarrService, releaseTimeout, {
          type: mediaType,
          limit: 100
        }).catch(() => []);
        usedProwlarr = Array.isArray(releases) && releases.length > 0;
      }
    }

    if (hasSeasonPackSearch) {
      releases = filterSeasonPackReleases(releases, seasonNumber);
    }

    if (yearNumber && Number.isFinite(yearNumber) && usedProwlarr) {
      const yearPattern = new RegExp(`\\b${yearNumber}\\b`);
      releases = releases.filter((release) => {
        const rawYear = release?.year ?? release?.movieYear ?? release?.movie?.year ?? null;
        if (rawYear && Number(rawYear) === yearNumber) return true;
        const releaseTitle = String(release?.title ?? release?.releaseTitle ?? "");
        return yearPattern.test(releaseTitle);
      });
    }

    const items = usedProwlarr ? releases.map(mapProwlarrResultToRow) : releases.map(mapReleaseToRow);
    const total = items.length;
    const start = offset;
    const end = start + limit;

    const payload = {
      items: items.slice(start, end),
      total,
      offset,
      limit,
      resolvedId
    };

    if (cacheKey) {
      releaseCache.set(cacheKey, { expiresAt: Date.now() + RELEASE_CACHE_TTL_MS, payload });
    }

    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load releases" }, { status: 500 });
  }
}
