import Image from "next/image";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { z } from "zod";
import { getCollection, tmdbImageUrl } from "@/lib/tmdb";
import { listRadarrQualityProfiles } from "@/lib/radarr";
import { CollectionRequestButton } from "@/components/Requests/CollectionRequestButton";
import { Film, Layers, Star, CheckCircle2 } from "lucide-react";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { getUser } from "@/auth";
import { getUserByUsername, listUserMediaList, upsertUser } from "@/db";
import { CollectionWatchedBulkActions } from "@/components/Collection/CollectionWatchedBulkActions";

const Params = z.object({ id: z.coerce.number().int() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

export async function generateMetadata({ params }: { params: ParamsInput }) {
  try {
    const { id } = Params.parse(await resolveParams(params));
    const collection = await getCollection(id);
    return {
      title: `${collection.name} - LeMedia`,
    };
  } catch {
    return {
      title: "Collection - LeMedia",
    };
  }
}

export default async function CollectionPage({ params }: { params: ParamsInput }) {
  const { id } = Params.parse(await resolveParams(params));
  const imageProxyEnabled = await getImageProxyEnabled();
  let collection: any;
  try {
    collection = await getCollection(id);
  } catch (err: any) {
    return (
      <div className="flex h-[50vh] items-center justify-center p-4">
        <div className="glass-strong rounded-2xl p-8 text-center max-w-md">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
            <Film className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Unable to load collection</h1>
          <p className="text-sm text-gray-400">{err?.message ?? "Unknown error from TMDB."}</p>
        </div>
      </div>
    );
  }
  const backdrop = tmdbImageUrl(collection.backdrop_path, "original", imageProxyEnabled);
  const poster = tmdbImageUrl(collection.poster_path, "w500", imageProxyEnabled);

  let qualityProfiles: any[] = [];
  let radarrError: string | null = null;
  try {
    qualityProfiles = (await listRadarrQualityProfiles()) ?? [];
  } catch (err: any) {
    radarrError = err?.message ?? "Radarr unavailable";
  }

  const parts = Array.isArray(collection.parts) ? collection.parts : [];
  // Sort by release date asc, fallback to title to keep order sensible
  const partsSorted = parts
    .slice()
    .sort((a: any, b: any) => {
      const ad = a.release_date ? Date.parse(a.release_date) : Number.POSITIVE_INFINITY;
      const bd = b.release_date ? Date.parse(b.release_date) : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  const movieStatus = parts.map((movie: any) => ({
    id: movie.id,
    title: movie.title ?? movie.name ?? `TMDB ${movie.id}`,
    posterPath: tmdbImageUrl(movie.poster_path, "w200", imageProxyEnabled),
    releaseDate: movie.release_date ?? null,
    status: undefined
  }));

  const defaultQualityProfileId = Number(process.env.RADARR_QUALITY_PROFILE_ID ?? qualityProfiles[0]?.id ?? 0);

  // Franchise completion: use only explicit watched-list entries so bulk mark/unmark works correctly.
  let watchedMovieIds = new Set<number>();
  try {
    const user = await getUser().catch(() => null);
    if (user?.username) {
      const dbUser = await getUserByUsername(user.username).catch(() => null)
        ?? await upsertUser(user.username, user.groups).catch(() => null);
      if (dbUser?.id) {
        const explicitWatched = await listUserMediaList({ userId: dbUser.id, listType: "watched", limit: 5000 }).catch(() => []);

        const explicitWatchedIds = explicitWatched
          .filter((item) => item.media_type === "movie")
          .map((item) => Number(item.tmdb_id));

        watchedMovieIds = new Set(explicitWatchedIds.filter((value) => Number.isFinite(value) && value > 0));
      }
    }
  } catch {
    watchedMovieIds = new Set<number>();
  }

  const watchedCount = parts.filter((movie: any) => watchedMovieIds.has(Number(movie.id))).length;
  const totalCount = parts.length;
  const completionPercent = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;
  const remainingCount = Math.max(totalCount - watchedCount, 0);

  // Calculate collection statistics
  const validRatings = parts.filter((m: any) => m.vote_average && m.vote_average > 0);
  const averageRating = validRatings.length > 0
    ? validRatings.reduce((sum: number, m: any) => sum + m.vote_average, 0) / validRatings.length
    : 0;
  
  const releaseDates = parts
    .filter((m: any) => m.release_date)
    .map((m: any) => new Date(m.release_date).getFullYear())
    .sort((a: number, b: number) => a - b);
  const yearRange = releaseDates.length > 0
    ? releaseDates[0] === releaseDates[releaseDates.length - 1]
      ? `${releaseDates[0]}`
      : `${releaseDates[0]} - ${releaseDates[releaseDates.length - 1]}`
    : null;

  return (
    <div className="media-page">
      {backdrop && (
        <div className="media-page-bg-image" style={{ height: 493 }}>
          <Image 
            src={backdrop} 
            alt="" 
            fill 
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
            sizes="100vw" 
            priority
          />
          <div className="absolute inset-0 media-page-gradient" />
        </div>
      )}

      <div className="media-header">
        <div className="media-poster relative">
          {poster ? (
            <Image src={poster} alt={collection.name} width={600} height={900} className="w-full h-auto" priority />
          ) : (
            <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center">
              <Layers className="h-12 w-12 text-gray-600" />
            </div>
          )}
          <div className="absolute left-2 top-2 pointer-events-none">
            <div className="rounded-full border border-purple-500 bg-purple-600/80 shadow-md">
              <div className="flex h-5 items-center px-2 text-xs font-medium uppercase tracking-wider text-white">
                COLLECTION
              </div>
            </div>
          </div>
        </div>

        <div className="media-title">
          <h1>{collection.name}</h1>
          <span className="media-attributes">
            <span>{parts.length} Movies</span>
            {yearRange && <span>{yearRange}</span>}
            {averageRating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                {averageRating.toFixed(1)}
              </span>
            )}
          </span>

          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-100">
                Franchise completion: {watchedCount}/{totalCount}
              </p>
              <p className="text-xs font-medium text-emerald-200">
                {completionPercent}% complete
              </p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-emerald-100/80">
              {remainingCount === 0 ? "Collection complete. Nice." : `${remainingCount} title${remainingCount === 1 ? "" : "s"} left to finish this franchise.`}
            </p>
            <CollectionWatchedBulkActions movieIds={parts.map((movie: any) => Number(movie.id)).filter((idValue: number) => Number.isFinite(idValue) && idValue > 0)} />
          </div>

          <div className="media-actions">
            {radarrError ? (
              <div className="w-full rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
                ⚠️ Radarr Error: {radarrError}
              </div>
            ) : (
              <CollectionRequestButton
                collectionId={collection.id}
                collectionName={collection.name}
                movies={movieStatus}
                qualityProfiles={qualityProfiles}
                defaultQualityProfileId={defaultQualityProfileId}
              />
            )}
          </div>
        </div>
      </div>

      <div className="media-overview">
        <div className="media-overview-left">
          <h2>Overview</h2>
          <p>{collection.overview || "No overview available."}</p>
        </div>
      </div>

      <div className="px-2 sm:px-3 md:px-8 pb-8">
        <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Movies in Collection</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {partsSorted.map((movie: any) => {
            const posterPath = tmdbImageUrl(movie.poster_path, "w300", imageProxyEnabled);
            const isWatched = watchedMovieIds.has(Number(movie.id));
            return (
              <PrefetchLink
                key={movie.id}
                href={`/movie/${movie.id}`}
                className="group block rounded-lg sm:rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                aria-label={`Open ${movie.title}`}
              >
                <div className="relative">
                  {posterPath ? (
                    <Image 
                      src={posterPath} 
                      alt={movie.title} 
                      width={300} 
                      height={450} 
                      className="w-full h-auto transition-transform duration-300 group-hover:scale-[1.03]" 
                    />
                  ) : (
                    <div className="aspect-[2/3] flex items-center justify-center bg-gray-800">
                      <Film className="h-6 sm:h-8 w-6 sm:w-8 text-gray-600" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {movie.vote_average && movie.vote_average > 0 && (
                    <div className="absolute top-2 right-2 bg-black/75 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      <span className="text-xs font-bold text-white">{movie.vote_average.toFixed(1)}</span>
                    </div>
                  )}
                  {isWatched && (
                    <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/80 px-2 py-1 text-[10px] font-semibold text-white shadow">
                      <CheckCircle2 className="h-3 w-3" />
                      Watched
                    </div>
                  )}
                </div>
                <div className="p-2 sm:p-3">
                  <div className="text-xs sm:text-sm font-semibold text-white line-clamp-2 mb-1">{movie.title}</div>
                  <div className="text-[10px] sm:text-xs text-muted">{movie.release_date?.slice(0, 4) ?? "TBA"}</div>
                </div>
              </PrefetchLink>
            );
          })}
        </div>
      </div>
    </div>
  );
}
