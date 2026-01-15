import Image from "next/image";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { z } from "zod";
import { getCollection, tmdbImageUrl } from "@/lib/tmdb";
import { listRadarrQualityProfiles } from "@/lib/radarr";
import { CollectionRequestButton } from "@/components/Requests/CollectionRequestButton";
import { Film, Layers } from "lucide-react";
import { getImageProxyEnabled } from "@/lib/app-settings";

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

  return (
    <div className="media-page">
      {backdrop && (
        <div className="media-page-bg-image">
          <Image src={backdrop} alt="" fill className="object-cover object-center" sizes="100vw" />
          <div className="absolute inset-0 media-page-gradient" />
        </div>
      )}

      <div className="media-header">
        <div className="media-poster">
          {poster ? (
            <Image src={poster} alt={collection.name} width={600} height={900} className="w-full h-auto" priority />
          ) : (
            <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center">
              <Layers className="h-12 w-12 text-gray-600" />
            </div>
          )}
        </div>

        <div className="media-title">
          <h1>{collection.name}</h1>
          <span className="media-attributes">
            <span>{parts.length} Movies</span>
          </span>
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
        <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Movies</h2>
        <div className="grid gap-2 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {partsSorted.map((movie: any) => {
            const posterPath = tmdbImageUrl(movie.poster_path, "w300", imageProxyEnabled);
            return (
              <PrefetchLink
                key={movie.id}
                href={`/movie/${movie.id}`}
                className="group block rounded-lg sm:rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                aria-label={`Open ${movie.title}`}
              >
                <div className="relative">
                  {posterPath ? (
                    <Image src={posterPath} alt={movie.title} width={300} height={450} className="w-full h-auto transition-transform duration-300 group-hover:scale-[1.02]" />
                  ) : (
                    <div className="aspect-[2/3] flex items-center justify-center bg-gray-800">
                      <Film className="h-6 sm:h-8 w-6 sm:w-8 text-gray-600" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-70" />
                </div>
                <div className="p-2 sm:p-3">
                  <div className="text-xs sm:text-sm font-semibold text-white line-clamp-1">{movie.title}</div>
                  <div className="text-[10px] sm:text-xs text-muted">{movie.release_date?.slice(0, 4) ?? "Unknown year"}</div>
                </div>
              </PrefetchLink>
            );
          })}
        </div>
      </div>
    </div>
  );
}
