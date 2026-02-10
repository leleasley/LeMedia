import { z } from "zod";
import { getTv, tmdbImageUrl } from "@/lib/tmdb";
import { TvDetailClientNew } from "@/components/Tv/TvDetailClientNew";
import { pickTrailerUrl } from "@/lib/trailer-utils";
import { MediaSlider } from "@/components/Media/MediaSlider";
import { getTvDetailAggregateFast } from "@/lib/media-aggregate-fast";
import { RecentlyViewedTracker } from "@/components/Media/RecentlyViewedTracker";
import { ExternalRatings } from "@/components/Media/ExternalRatings";
import { headers } from "next/headers";
import { MediaReviews } from "@/components/Reviews/MediaReviews";
import { getUser } from "@/auth";
import { getReviewStatsForMedia, getReviewsForMedia, getUserByUsername, getUserMediaListStatus, getUserReviewForMedia, upsertUser } from "@/db";

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

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) return null;
  const dbUser = await getUserByUsername(user.username).catch(() => null);
  if (dbUser) return dbUser.id;
  const created = await upsertUser(user.username, user.groups).catch(() => null);
  return created?.id ?? null;
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

export async function generateMetadata({ params }: { params: ParamsInput }) {
  try {
    const { id } = Params.parse(await resolveParams(params));
    const tv = await getTv(id);
    return {
      title: `${tv.name} - LeMedia`,
    };
  } catch {
    return {
      title: "TV Show - LeMedia",
    };
  }
}

export default async function TvPage({ params }: { params: ParamsInput }) {
  try {
    const { id } = Params.parse(await resolveParams(params));

    const detailsPromise = getTvDetailAggregateFast(id);
    const userIdPromise = resolveUserId();
    const ratingsPromise = fetchRatings("tv", id);

    const [details, userId, initialRatings] = await Promise.all([
      detailsPromise,
      userIdPromise,
      ratingsPromise
    ]);

    const tv = details.tv;
    const imageProxyEnabled = details.imageProxyEnabled;
    const streamingProviders = details.streamingProviders;
    const watchProviders = details.watchProviders;
    const contentRatings = details.contentRatings;
    const keywords = details.keywords;
    const tvdbId = details.tvdbId;
    const imdbId = details.imdbId;
    const [listStatus, reviews, reviewStats, userReview] = await Promise.all([
      userId ? getUserMediaListStatus({ userId, mediaType: "tv", tmdbId: id }).catch(() => null) : Promise.resolve(null),
      getReviewsForMedia("tv", id, 50).catch(() => []),
      getReviewStatsForMedia("tv", id).catch(() => ({ total: 0, average: 0 })),
      userId ? getUserReviewForMedia(userId, "tv", id).catch(() => null) : Promise.resolve(null)
    ]);

    // These values hydrate client-side via SWR in TvDetailClientNew.
    const qualityProfiles: any[] = [];
    const defaultQualityProfileId = 0;
    const requestsBlocked = false;
    const sonarrError = null;
    const existingSeries = null;
    const availableInJellyfin = null;
    const availableSeasons: number[] = [];
    const availableInLibrary = false;
    const playUrl = null;
    const isAdmin = false;
    const manageItemId = null;
    const manageSlug = null;
    const manageBaseUrl = null;

    const poster = tmdbImageUrl(tv.poster_path, "w600_and_h900_bestv2", false);
    const backdrop = tmdbImageUrl(tv.backdrop_path, "w1920_and_h800_multi_faces", false);
    const trailerUrl = pickTrailerUrl(tv);
    const seasons = (tv.seasons ?? [])
      .filter((s: any) => s.season_number !== 0)
      .sort((a: any, b: any) => a.season_number - b.season_number);

    return (
      <>
        <RecentlyViewedTracker
          mediaType="tv"
          tmdbId={tv.id}
          title={tv.name}
          posterPath={tv.poster_path}
        />
        <TvDetailClientNew
          tv={tv}
          poster={poster}
          backdrop={backdrop}
          imageProxyEnabled={false}
          trailerUrl={trailerUrl}
          playUrl={playUrl}
          seasons={seasons}
          qualityProfiles={qualityProfiles}
          defaultQualityProfileId={defaultQualityProfileId}
          sonarrError={sonarrError}
          requestsBlocked={requestsBlocked}
          existingSeries={existingSeries}
          availableInJellyfin={availableInJellyfin}
          availableSeasons={availableSeasons}
          availableInLibrary={availableInLibrary}
          streamingProviders={streamingProviders}
          watchProviders={watchProviders}
          contentRatings={contentRatings}
          imdbRating={null}
          rtCriticsScore={null}
          rtCriticsRating={null}
          rtAudienceScore={null}
          rtAudienceRating={null}
          rtUrl={null}
          metacriticScore={null}
          keywords={keywords}
          isAdmin={isAdmin}
          manageItemId={manageItemId}
          manageSlug={manageSlug}
          manageBaseUrl={manageBaseUrl}
          tvdbId={tvdbId}
          prefetchedAggregate={undefined}
          externalRatingsSlot={
            <ExternalRatings tmdbId={tv.id} mediaType="tv" imdbId={imdbId} initialData={initialRatings} />
          }
          initialListStatus={listStatus ?? undefined}
        >
          <div className="px-4 mt-8">
            <MediaReviews
              tmdbId={tv.id}
              mediaType="tv"
              title={tv.name}
              posterPath={tv.poster_path}
              releaseYear={tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : null}
              imageProxyEnabled={imageProxyEnabled}
              initialData={{ stats: reviewStats, reviews, userReview }}
            />
          </div>
          {/* Recommendations Section */}
          <div className="px-4 mt-8">
            <MediaSlider
              title="Recommendations"
              url={`/api/v1/tmdb/tv/${tv.id}/recommendations`}
              sliderKey={`tv-${tv.id}-recommendations`}
              mediaType="tv"
            />
          </div>

          {/* Similar TV Shows Section */}
          <div className="px-4 mt-8 mb-8">
            <MediaSlider
              title="Similar Series"
              url={`/api/v1/tmdb/tv/${tv.id}/similar`}
              sliderKey={`tv-${tv.id}-similar`}
              mediaType="tv"
            />
          </div>
        </TvDetailClientNew>
      </>
    );
  } catch (e: any) {
    return (
      <div className="glass-strong rounded-2xl p-4">
        <h1 className="text-xl font-bold text-text">Unable to load show</h1>
        <p className="mt-2 text-sm text-muted">{e?.message ?? "Unknown error from TMDB."}</p>
      </div>
    );
  }
}
