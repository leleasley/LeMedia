import Image from "next/image";
import Link from "next/link";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { z } from "zod";
import { getMovie, tmdbImageUrl } from "@/lib/tmdb";
import { MovieAvailabilityBadge, MovieActionButtons } from "@/components/Movie/MovieAggregateClient";
import { pickTrailerUrl } from "@/lib/trailer-utils";
import { Film } from "lucide-react";
import { MediaInfoBox } from "@/components/Media/MediaInfoBox";
import { MediaSlider } from "@/components/Media/MediaSlider";
import { getMovieDetailAggregateFast } from "@/lib/media-aggregate-fast";
import { headers } from "next/headers";
import { RecentlyViewedTracker } from "@/components/Media/RecentlyViewedTracker";
import { ExternalRatings } from "@/components/Media/ExternalRatings";
import { MediaReviews } from "@/components/Reviews/MediaReviews";
import { MediaCastScroller } from "@/components/Media/MediaCastScroller";
import { MediaGalleryStrip } from "@/components/Media/MediaGalleryStrip";
import { MediaSocialPanel } from "@/components/Media/MediaSocialPanel";
import tmdbLogo from "@/assets/tmdb_logo.svg";
import { getUser } from "@/auth";
import { findActiveRequestByTmdb, getReviewStatsForMedia, getReviewsForMedia, getUserByUsername, getUserMediaListStatus, getUserReviewForMedia, upsertUser } from "@/db";

const Params = z.object({ id: z.coerce.number().int() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function getBaseUrlFromHeaders() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const fallbackBaseUrl = process.env.INTERNAL_APP_BASE_URL ?? process.env.APP_BASE_URL ?? "";
  const baseUrl = host ? `${proto}://${host}` : fallbackBaseUrl;
  return baseUrl.replace(/\/+$/, "");
}

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

async function fetchRatings(mediaType: "movie" | "tv", tmdbId: number) {
  const baseUrl = await getBaseUrlFromHeaders();
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/api/v1/ratings/${mediaType}/${tmdbId}`, {
      next: { revalidate: 900 }
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    if (!json || !json.ratings) return null;
    return { ratings: json.ratings };
  } catch {
    return null;
  }
}

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) return null;
  const dbUser = await getUserByUsername(user.username).catch(() => null);
  if (dbUser) return dbUser.id;
  const created = await upsertUser(user.username, user.groups).catch(() => null);
  return created?.id ?? null;
}

function getDigitalReleaseDate(releaseDates: any, region = (process.env.TMDB_REGION || "GB")): string | null {
  if (!releaseDates?.results || !Array.isArray(releaseDates.results)) return null;
  for (const country of releaseDates.results) {
    if (country?.iso_3166_1 !== region && country?.iso_3166_1 !== "US") continue;
    const digitalRelease = country?.release_dates?.find((rd: any) => Number(rd?.type) === 4);
    if (digitalRelease?.release_date) {
      return String(digitalRelease.release_date).split("T")[0];
    }
  }
  return null;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

    const detailsPromise = getMovieDetailAggregateFast(id);
    const userIdPromise = resolveUserId();
    const ratingsPromise = fetchRatings("movie", id);
    const activeRequestPromise = findActiveRequestByTmdb({ requestType: "movie", tmdbId: id }).catch(() => null);

    const [details, userId, initialRatings, activeRequest] = await Promise.all([
      detailsPromise,
      userIdPromise,
      ratingsPromise,
      activeRequestPromise
    ]);

    const movie = details.movie;
    const [listStatus, reviews, reviewStats, userReview] = await Promise.all([
      userId ? getUserMediaListStatus({ userId, mediaType: "movie", tmdbId: id }).catch(() => null) : Promise.resolve(null),
      getReviewsForMedia("movie", id, 50).catch(() => []),
      getReviewStatsForMedia("movie", id).catch(() => ({ total: 0, average: 0 })),
      userId ? getUserReviewForMedia(userId, "movie", id).catch(() => null) : Promise.resolve(null)
    ]);
    const imageProxyEnabled = details.imageProxyEnabled;
    const streamingProviders = details.streamingProviders;
    const watchProviders = details.watchProviders;
    const releaseDates = details.releaseDates;
    const digitalReleaseDate = getDigitalReleaseDate(releaseDates);
    const keywords = details.keywords;
    const imdbId = details.imdbId;

    const poster = tmdbImageUrl(movie.poster_path, "w600_and_h900_bestv2", imageProxyEnabled);
    const backdrop = tmdbImageUrl(movie.backdrop_path, "w1920_and_h800_multi_faces", imageProxyEnabled);
    const backdropImage = backdrop ?? poster;
    const trailerUrl = pickTrailerUrl(movie);
    const cast: any[] = (movie?.credits?.cast ?? []).slice(0, 50);
    const crew: any[] = (movie?.credits?.crew ?? []).slice(0, 6);
    const fullCrew: any[] = movie?.credits?.crew ?? [];

    const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
    const collection = movie.belongs_to_collection ?? null;
    const collectionBackdrop = tmdbImageUrl(collection?.backdrop_path, "w1440_and_h320_multi_faces", imageProxyEnabled);

    // Movie attributes for display
    const movieAttributes = [];
    if (movie.runtime > 0) {
      const hours = Math.floor(movie.runtime / 60);
      const mins = movie.runtime % 60;
      movieAttributes.push(hours > 0 ? `${hours}h ${mins}m` : `${mins}m`);
    }
    if (movie.genres && movie.genres.length > 0) {
      movieAttributes.push(...movie.genres.map((g: any) => g.name));
    }
    if (digitalReleaseDate) {
      movieAttributes.push(`Digital ${formatShortDate(digitalReleaseDate)}`);
    }

    const trailers = (movie.videos?.results ?? [])
      .filter((v: any) => String(v?.site || "").toLowerCase() === "youtube" && v?.key)
      .slice(0, 6)
      .map((v: any) => ({
        name: String(v?.name || "Trailer"),
        url: `https://www.youtube.com/watch?v=${v.key}`
      }));

    return (
      <div className="media-page">
      <RecentlyViewedTracker
        mediaType="movie"
        tmdbId={movie.id}
        title={movie.title}
        posterPath={movie.poster_path}
      />

      {/* Backdrop with gradient overlay */}
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

      {/* Media Header - Poster + Title */}
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
              sizes="(max-width: 768px) 128px, (max-width: 1024px) 192px, 224px"
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
            <MovieAvailabilityBadge tmdbId={movie.id} title={movie.title} />
          </div>
          <h1 data-testid="media-title">
            {movie.title}{" "}
            {releaseYear && (
              <span className="media-year">({releaseYear})</span>
            )}
          </h1>

          {/* Inline Ratings */}
          <div className="media-ratings-inline">
            {movie.vote_average > 0 && (
              <Link
                href={`https://www.themoviedb.org/movie/${movie.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="media-rating"
                title={`TMDB: ${(movie.vote_average * 10).toFixed(0)}%`}
              >
                <div className="w-4 h-4 sm:w-5 sm:h-5 relative">
                  <Image src={tmdbLogo} alt="TMDB" fill className="object-contain" />
                </div>
                <span className="text-xs sm:text-sm font-bold text-white">{(movie.vote_average * 10).toFixed(0)}%</span>
              </Link>
            )}
            <ExternalRatings tmdbId={movie.id} mediaType="movie" imdbId={imdbId} initialData={initialRatings} />
          </div>

          <MediaSocialPanel
            tmdbId={movie.id}
            mediaType="movie"
            requestedBy={activeRequest?.requestedBy ?? null}
            initialWatchlist={listStatus?.watchlist ?? null}
          />

          {/* Attributes */}
          {movieAttributes.length > 0 && (
            <span className="media-attributes">
              {movieAttributes.map((attr, idx) => (
                <span key={idx}>{attr}</span>
              ))}
            </span>
          )}

          {/* Tagline in header */}
          {movie.tagline && (
            <div className="media-tagline">&ldquo;{movie.tagline}&rdquo;</div>
          )}

          {/* Action Buttons */}
          <div className="media-actions">
            <MovieActionButtons
              tmdbId={movie.id}
              title={movie.title}
              trailerUrl={trailerUrl}
              backdropUrl={backdropImage}
              posterUrl={poster}
              year={releaseYear ?? null}
              initialListStatus={listStatus}
            />
          </div>
        </div>
      </div>

      {/* Overview Section - Full Width */}
      <div className="media-overview">
        <div className="media-overview-left">
          <h2>Overview</h2>
          <p>{movie.overview || "No overview available."}</p>

          {/* Crew */}
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

          {/* Keywords */}
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
        </div>
      </div>

      {/* Details Section - Full Width Glass Card */}
      <div className="media-section">
        {collection && (
          <div className="group relative z-0 mb-6 h-24 scale-100 transform-gpu cursor-pointer overflow-hidden rounded-xl bg-gray-800 bg-cover bg-center shadow-md ring-1 ring-white/10 transition duration-300 hover:scale-[1.02] hover:ring-white/20">
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
              <div className="font-semibold">{collection.name}</div>
              <PrefetchLink
                href={`/collection/${collection.id}`}
                className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition duration-300 hover:bg-white/20"
              >
                View Collection
              </PrefetchLink>
            </div>
          </div>
        )}

        <MediaInfoBox
          releaseDate={movie.release_date}
          digitalReleaseDate={digitalReleaseDate ?? undefined}
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
          watchProviders={watchProviders}
          genres={movie.genres ?? []}
          status={movie.status}
          originalLanguage={movie.original_language}
          productionCountries={movie.production_countries ?? []}
          releaseDates={releaseDates}
          type="movie"
        />
      </div>

      <MediaGalleryStrip trailers={trailers} />

      <MediaCastScroller
        title="Cast"
        items={cast.map((person: any) => ({
          id: person.id,
          name: person.name ?? "Unknown",
          role: person.character ?? null,
          profileUrl: person.profile_path
            ? tmdbImageUrl(person.profile_path, "w300", imageProxyEnabled) || null
            : null
        }))}
        crewItems={fullCrew.map((person: any) => ({
          id: person.id,
          name: person.name ?? "Unknown",
          role: person.job ?? null,
          profileUrl: person.profile_path
            ? tmdbImageUrl(person.profile_path, "w300", imageProxyEnabled) || null
            : null
        }))}
        previewCount={12}
      />

      {/* Reviews */}
      <div className="media-section">
        <MediaReviews
          tmdbId={movie.id}
          mediaType="movie"
          title={movie.title}
          posterPath={movie.poster_path}
          releaseYear={releaseYear}
          imageProxyEnabled={imageProxyEnabled}
          initialData={{ stats: reviewStats, reviews, userReview }}
        />
      </div>

      {/* Recommendations & Similar */}
      <div className="media-section space-y-6 sm:space-y-10">
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
