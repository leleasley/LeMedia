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
import { getUserByUsername, getUserMediaListStatus, upsertUser } from "@/db";

const Params = z.object({ id: z.coerce.number().int() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

async function fetchTvAggregate(tmdbId: number, tvdbId?: number | null, title?: string) {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const fallbackBaseUrl = process.env.INTERNAL_APP_BASE_URL ?? process.env.APP_BASE_URL ?? "";
  const baseUrl = host ? `${proto}://${host}` : fallbackBaseUrl;
  if (!baseUrl) return null;
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  if (tvdbId) params.set("tvdbId", String(tvdbId));
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const url = `${normalizedBaseUrl}/api/v1/tv/${tmdbId}${params.toString() ? `?${params.toString()}` : ""}`;
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

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) return null;
  const dbUser = await getUserByUsername(user.username).catch(() => null);
  if (dbUser) return dbUser.id;
  const created = await upsertUser(user.username, user.groups).catch(() => null);
  return created?.id ?? null;
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

    // Fetch details first to get tvdbId
    const details = await getTvDetailAggregateFast(id);
    const tv = details.tv;
    const imageProxyEnabled = details.imageProxyEnabled;
    const streamingProviders = details.streamingProviders;
    const watchProviders = details.watchProviders;
    const contentRatings = details.contentRatings;
    const keywords = details.keywords;
    const tvdbId = details.tvdbId;
    const imdbId = details.imdbId;
    const userId = await resolveUserId();
    const listStatus = userId ? await getUserMediaListStatus({ userId, mediaType: "tv", tmdbId: id }).catch(() => null) : null;

    // Now fetch aggregate with proper tvdbId
    const aggregate = await fetchTvAggregate(id, tvdbId, tv.name || "");

    // Extract aggregate data
    const sonarr = aggregate?.sonarr ?? {};
    const qualityProfiles = Array.isArray(sonarr.qualityProfiles) ? sonarr.qualityProfiles : [];
    const defaultQualityProfileId = typeof sonarr.defaultQualityProfileId === "number" ? sonarr.defaultQualityProfileId : 0;
    const requestsBlocked = Boolean(sonarr.requestsBlocked);
    const sonarrError = sonarr.sonarrError ?? null;
    const existingSeries = sonarr.existingSeries ?? null;
    const availableInJellyfin = sonarr.availableInJellyfin ?? null;
    const availableSeasons = Array.isArray(aggregate?.availableSeasons) ? aggregate.availableSeasons : [];
    const availableInLibrary = Boolean(aggregate?.availableInLibrary);
    const playUrl = aggregate?.playUrl ?? null;
    const isAdmin = Boolean(aggregate?.isAdmin);
    const manageItemId = aggregate?.manage?.itemId ?? null;
    const manageSlug = aggregate?.manage?.slug ?? null;
    const manageBaseUrl = aggregate?.manage?.baseUrl ?? null;

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
          prefetchedAggregate={aggregate}
          externalRatingsSlot={
            <ExternalRatings tmdbId={tv.id} mediaType="tv" imdbId={imdbId} />
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
