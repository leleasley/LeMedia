import Image from "next/image";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { z } from "zod";
import { getMovie, tmdbImageUrl } from "@/lib/tmdb";
import { MovieAvailabilityBadge, MovieActionButtons } from "@/components/Movie/MovieAggregateClient";
import { pickTrailerUrl } from "@/lib/trailer-utils";
import { Users, Film } from "lucide-react";
import { MediaInfoBox } from "@/components/Media/MediaInfoBox";
import { MediaSlider } from "@/components/Media/MediaSlider";
import { getMovieDetailAggregateFast } from "@/lib/media-aggregate-fast";
import { headers } from "next/headers";
import { RecentlyViewedTracker } from "@/components/Media/RecentlyViewedTracker";
import { ExternalRatings } from "@/components/Media/ExternalRatings";

const Params = z.object({ id: z.coerce.number().int() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

async function fetchMovieAggregate(tmdbId: number, title?: string) {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host) return null;
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  const url = `${proto}://${host}/api/v1/movie/${tmdbId}${params.toString() ? `?${params.toString()}` : ""}`;
  try {
    const res = await fetch(url, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store"
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}


export async function generateMetadata({ params }: { params: ParamsInput }) {
  try {
    const { id } = Params.parse(await resolveParams(params));
    const movie = await getMovie(id);
    return {
      title: `${movie.title} - LeMedia`,
    };
  } catch {
    return {
      title: "Movie - LeMedia",
    };
  }
}

export default async function MoviePage({ params }: { params: ParamsInput }) {
  try {
    const { id } = Params.parse(await resolveParams(params));

    // Fetch only fast data - no slow external APIs (OMDB, Rotten Tomatoes)
    // This makes the page show instantly
    const [details, aggregate] = await Promise.all([
      getMovieDetailAggregateFast(id),
      fetchMovieAggregate(id, "")
    ]);

    const movie = details.movie;
    const imageProxyEnabled = details.imageProxyEnabled;
    const streamingProviders = details.streamingProviders;
    const keywords = details.keywords;
    const imdbId = details.imdbId;

    const poster = tmdbImageUrl(movie.poster_path, "w600_and_h900_bestv2", imageProxyEnabled);
    const backdrop = tmdbImageUrl(movie.backdrop_path, "w1920_and_h800_multi_faces", imageProxyEnabled);
    const backdropImage = backdrop ?? poster;
    const trailerUrl = pickTrailerUrl(movie);
    const cast: any[] = (movie?.credits?.cast ?? []).slice(0, 20);
    const crew: any[] = (movie?.credits?.crew ?? []).slice(0, 6);

    const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
    const collection = movie.belongs_to_collection ?? null;
    const collectionBackdrop = tmdbImageUrl(collection?.backdrop_path, "w1440_and_h320_multi_faces", imageProxyEnabled);

    // Movie attributes for display
    const movieAttributes = [];
    if (movie.runtime > 0) {
      movieAttributes.push(`${movie.runtime} minutes`);
    }
    if (movie.genres && movie.genres.length > 0) {
      movieAttributes.push(...movie.genres.map((g: any) => g.name));
    }

    return (
      <div className="media-page">
      <RecentlyViewedTracker
        mediaType="movie"
        tmdbId={movie.id}
        title={movie.title}
        posterPath={movie.poster_path}
      />
      {/* Backdrop with Seerr-style gradient overlay */}
      {backdropImage && (
        <div className="media-page-bg-image" style={{ height: 493 }}>
          <Image
            src={backdropImage}
            alt=""
            fill
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 media-page-gradient" />
        </div>
      )}

      {/* Media Header - Poster + Title (Seerr Style) */}
      <div className="media-header">
        {/* Poster */}
        <div className="media-poster relative">
          {poster ? (
            <Image
              src={poster}
              alt={movie.title || "Movie"}
              width={600}
              height={900}
              className="w-full h-auto"
              priority
              sizes="(max-width: 768px) 128px, (max-width: 1024px) 176px, 208px"
            />
          ) : (
            <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center">
              <Film className="h-16 w-16 text-gray-600" />
            </div>
          )}
          <div className="absolute left-2 top-2 pointer-events-none">
            <div className="rounded-full border border-blue-500 bg-blue-600/80 shadow-md">
              <div className="flex h-5 items-center px-2 text-xs font-medium uppercase tracking-wider text-white">
                MOVIE
              </div>
            </div>
          </div>
        </div>

        {/* Media Title Section */}
        <div className="media-title">
          <div className="media-status">
            <MovieAvailabilityBadge tmdbId={movie.id} title={movie.title} prefetched={aggregate ?? undefined} />
          </div>
          <h1 data-testid="media-title">
            {movie.title}{" "}
            {releaseYear && (
              <span className="media-year">({releaseYear})</span>
            )}
          </h1>

          {/* Attributes */}
          {movieAttributes.length > 0 && (
            <span className="media-attributes">
              {movieAttributes.map((attr, idx) => (
                <span key={idx}>
                  {idx > 0 && <span>|</span>}
                  <span>{attr}</span>
                </span>
              ))}
            </span>
          )}

          {/* Action Buttons */}
          <div className="media-actions">
            <MovieActionButtons
              tmdbId={movie.id}
              title={movie.title}
              trailerUrl={trailerUrl}
              backdropUrl={backdropImage}
              posterUrl={poster}
              prefetched={aggregate ?? undefined}
            />
          </div>
        </div>
      </div>

      {/* Media Overview - Left (Overview + Crew) & Right (Facts) */}
      <div className="media-overview">
        <div className="media-overview-left">
          {movie.tagline && <div className="tagline">{movie.tagline}</div>}
          <h2>Overview</h2>
          <p>{movie.overview || "No overview available."}</p>

          {keywords.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-1.5 text-gray-300">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
                  <path
                    fill="currentColor"
                    d="M21 11l-9.2 9.2a2 2 0 0 1-2.8 0L3 14.2a2 2 0 0 1 0-2.8L12.2 2H19a2 2 0 0 1 2 2v7zM7.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
                  />
                </svg>
              </span>
              {keywords.map((keyword: any) => (
                <span
                  key={keyword.id}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-200"
                >
                  {keyword.name}
                </span>
              ))}
            </div>
          )}

          {/* Crew - Seerr Style */}
          {crew.length > 0 && (
            <ul className="media-crew">
              {crew.map((person: any) => (
                <li key={`${person.id}-${person.job}`}>
                  <span className="crew-job">{person.job}</span>
                  <PrefetchLink href={`/person/${person.id}`} className="crew-name">
                    {person.name}
                  </PrefetchLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right side: Collection + Media Facts */}
        <div className="media-overview-right">
          {collection && (
            <div className="group relative z-0 mb-4 h-24 scale-100 transform-gpu cursor-pointer overflow-hidden rounded-lg bg-gray-800 bg-cover bg-center shadow-md ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:ring-gray-500">
              <div className="absolute inset-0 z-0">
                {collectionBackdrop && (
                  <Image
                    src={collectionBackdrop}
                    alt={collection.name}
                    fill
                    className="object-cover"
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, rgba(31, 41, 55, 0.47) 0%, rgba(31, 41, 55, 0.80) 100%)",
                  }}
                />
              </div>
              <div className="relative z-10 flex h-full items-center justify-between p-4 text-gray-200 transition duration-300 group-hover:text-white">
                <div>{collection.name}</div>
                <PrefetchLink
                  href={`/collection/${collection.id}`}
                  className="inline-flex items-center rounded-md border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-200 transition duration-300 hover:text-white"
                >
                  View
                </PrefetchLink>
              </div>
            </div>
          )}
          <MediaInfoBox
            releaseDate={movie.release_date}
            digitalReleaseDate={undefined}
            runtime={movie.runtime}
            voteAverage={movie.vote_average}
            tmdbId={movie.id}
            imdbId={imdbId}
            rtCriticsScore={null}
            rtCriticsRating={null}
            rtAudienceScore={null}
            rtAudienceRating={null}
            rtUrl={null}
            imdbRating={null}
            metacriticScore={null}
            streamingProviders={streamingProviders}
            genres={movie.genres ?? []}
            status={movie.status}
            originalLanguage={movie.original_language}
            productionCountries={movie.production_countries ?? []}
            releaseDates={null}
            type="movie"
            externalRatingsSlot={<ExternalRatings tmdbId={movie.id} mediaType="movie" imdbId={imdbId} />}
          />
        </div>
      </div>

      {/* Cast Section */}
      {cast.length > 0 && (
        <div className="mt-6 sm:mt-10">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Top Cast
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 sm:gap-3">
            {cast.map((person: any) => {
              const name = person.name ?? "Unknown";
              const character = person.character ?? "";
              const label = character ? `${name} as ${character}` : name;
              return (
                <PrefetchLink
                  key={person.id}
                  href={`/person/${person.id}`}
                  aria-label={`View ${label}`}
                  className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-md sm:rounded-lg border border-white/10 bg-white/5 transition-transform duration-300 group-hover:scale-105 group-hover:border-white/20">
                    {person.profile_path ? (
                      <Image
                        src={tmdbImageUrl(person.profile_path, "w300", imageProxyEnabled) || ""}
                        alt={name}
                        width={300}
                        height={450}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Users className="h-4 w-4 sm:h-6 sm:w-6 text-gray-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-70" />
                  </div>
                  <p className="mt-1 text-[10px] sm:text-xs text-white font-semibold line-clamp-1 text-center">{name}</p>
                  <p className="text-[9px] sm:text-[11px] text-gray-400 line-clamp-1 text-center">{character}</p>
                </PrefetchLink>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations & Similar */}
      <div className="mt-8 sm:mt-12 space-y-6 sm:space-y-10">
        <MediaSlider
          title="Recommendations"
          url={`/api/v1/tmdb/movie/${movie.id}/recommendations`}
          sliderKey="recommendations"
          mediaType="movie"
        />
        <MediaSlider
          title="Similar Titles"
          url={`/api/v1/tmdb/movie/${movie.id}/similar`}
          sliderKey="similar"
          mediaType="movie"
        />
      </div>

      <div className="extra-bottom-space relative" />
      </div>
    );
  } catch (e: any) {
    return (
      <div className="flex h-[50vh] items-center justify-center p-4">
        <div className="glass-strong rounded-2xl p-8 text-center max-w-md">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
            <Film className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Unable to load movie</h1>
          <p className="text-sm text-gray-400">{e?.message ?? "Unknown error from TMDB."}</p>
        </div>
      </div>
    );
  }
}
