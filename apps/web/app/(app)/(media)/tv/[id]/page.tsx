import { z } from "zod";
import { getTv, tmdbImageUrl } from "@/lib/tmdb";
import { TvDetailClientNew } from "@/components/Tv/TvDetailClientNew";
import { pickTrailerUrl } from "@/lib/trailer-utils";
import { MediaSlider } from "@/components/Media/MediaSlider";
import { getTvDetailAggregate } from "@/lib/media-aggregate";
import { RecentlyViewedTracker } from "@/components/Media/RecentlyViewedTracker";

const Params = z.object({ id: z.coerce.number().int() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
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
  let tv: any;
  let streamingProviders: any[] = [];
  let tvdbId: number | null = null;
  let imageProxyEnabled = false;
  let keywords: any[] = [];
  let ratings: {
    imdbId: string | null;
    imdbRating: string | null;
    metacriticScore: string | null;
    rtCriticsScore: number | null;
    rtCriticsRating: string | null;
    rtAudienceScore: number | null;
    rtAudienceRating: string | null;
    rtUrl: string | null;
  } | null = null;

  try {
    const { id } = Params.parse(await resolveParams(params));

    const details = await getTvDetailAggregate(id);
    tv = details.tv;
    imageProxyEnabled = details.imageProxyEnabled;
    streamingProviders = details.streamingProviders;
    keywords = details.keywords;
    ratings = details.ratings;
    tvdbId = details.tvdbId;

  } catch (e: any) {
    return (
      <div className="glass-strong rounded-2xl p-4">
        <h1 className="text-xl font-bold text-text">Unable to load show</h1>
        <p className="mt-2 text-sm text-muted">{e?.message ?? "Unknown error from TMDB."}</p>
      </div>
    );
  }

  const poster = tmdbImageUrl(tv.poster_path, "w600_and_h900_bestv2", imageProxyEnabled);
  const backdrop = tmdbImageUrl(tv.backdrop_path, "w1920_and_h800_multi_faces", imageProxyEnabled);
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
        trailerUrl={trailerUrl}
        playUrl={null}
        seasons={seasons}
        qualityProfiles={[]}
        defaultQualityProfileId={0}
        sonarrError={null}
        requestsBlocked={true}
        existingSeries={null}
        availableInJellyfin={null}
        availableInLibrary={false}
        streamingProviders={streamingProviders}
        imdbRating={ratings?.imdbRating ?? null}
        rtCriticsScore={ratings?.rtCriticsScore ?? null}
        rtCriticsRating={ratings?.rtCriticsRating ?? null}
        rtAudienceScore={ratings?.rtAudienceScore ?? null}
        rtAudienceRating={ratings?.rtAudienceRating ?? null}
        rtUrl={ratings?.rtUrl ?? null}
        metacriticScore={ratings?.metacriticScore ?? null}
        keywords={keywords}
        isAdmin={false}
        manageItemId={null}
        manageSlug={null}
        manageBaseUrl={null}
        tvdbId={tvdbId}
      >
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
}
