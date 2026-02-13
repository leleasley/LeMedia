import { redirect } from "next/navigation";
import { listDashboardSlidersForUser, upsertUser } from "@/db";
import { getUser } from "@/auth";

export const metadata = {
  title: "Discover - LeMedia",
};
export const revalidate = 0;

import { getPopularMovies, getPopularTv, getTopRatedMovies, getTopRatedTv, getTrendingAll, getUpcomingMoviesUkLatest, getUpcomingTvAccurate, tmdbImageUrl } from "@/lib/tmdb";
import { MediaCarousel } from "@/components/Media/MediaCarousel";
import { DiscoverHeroCarousel } from "@/components/Discover/DiscoverHeroCarousel";
import { DashboardGenreRail } from "@/components/Dashboard/DashboardGenreRail";
import { RecentRequestsSliderClient } from "@/components/Dashboard/RecentRequestsSliderClient";
import { RecentAddedCarouselClient } from "@/components/Dashboard/RecentAddedCarouselClient";
import { ContinueWatchingCarouselClient } from "@/components/Dashboard/ContinueWatchingCarouselClient";
import { MediaListCarouselClient } from "@/components/Dashboard/MediaListCarouselClient";
import { NetworksSlider } from "@/components/Dashboard/NetworksSlider";
import { RecentlyViewedCarousel } from "@/components/Dashboard/RecentlyViewedCarousel";
import { getImageProxyEnabled } from "@/lib/app-settings";
import DashboardCustomizeClient from "@/components/Dashboard/DashboardCustomizeClient";
import DashboardTmdbCustomCarousel from "@/components/Dashboard/DashboardTmdbCustomCarousel";
import { DashboardSliderType } from "@/lib/dashboard-sliders";
import { WatchStatsWidget } from "@/components/Stats/WatchStatsWidget";
import { getMovieRatings, getTVRatings } from "@/lib/rottentomatoes";

type MediaCard = {
  id: number;
  title: string;
  year: string;
  rating: number;
  poster: string | null;
  href: string;
  overview?: string;
  type?: "movie" | "tv";
};

function toCards(list: any[], type: "movie" | "tv", useProxy: boolean): MediaCard[] {
  return (list ?? [])
    .filter(item => item && item.id)
    .slice(0, 20)
    .map(item => ({
      id: item.id,
      title: type === "movie" ? item.title ?? "Untitled" : item.name ?? "Untitled",
      year: type === "movie"
        ? (item.release_date ?? "").slice(0, 4)
        : (item.first_air_date ?? "").slice(0, 4),
      rating: item.vote_average ?? 0,
      poster: tmdbImageUrl(item.poster_path, "w500", useProxy),
      href: type === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`,
      overview: item.overview,
      type
    }));
}

export default async function Page() {
  const u = await getUser().catch(() => null);
  if (!u) {
    redirect("/login");
  }
  const [imageProxyEnabled, userRecord] = await Promise.all([
    getImageProxyEnabled(),
    upsertUser(u.username, u.groups)
  ]);
  const { id: userId } = userRecord;
  
  let sliders: any[] = [];
  try {
    sliders = await listDashboardSlidersForUser(userId);
  } catch (error) {
    console.error("Failed to load dashboard sliders:", error);
    // Continue with empty sliders to avoid crashing the page
  }

  const enabledTypes = new Set<number>(sliders.filter(s => s.enabled).map(s => Number(s.type)));
  const safe = async <T extends { results?: any[] }>(fn: () => Promise<T>): Promise<any[]> => {
    try {
      const data = await fn();
      return data?.results ?? [];
    } catch {
      return [];
    }
  };
  const [
    trendingRaw,
    popularMoviesRaw,
    popularTvRaw,
    topRatedMoviesRaw,
    topRatedTvRaw,
    upcomingMoviesRaw,
    upcomingTvRaw
  ] = await Promise.all([
    enabledTypes.has(DashboardSliderType.TRENDING) ? safe(() => getTrendingAll()) : Promise.resolve([]),
    enabledTypes.has(DashboardSliderType.POPULAR_MOVIES) ? safe(() => getPopularMovies()) : Promise.resolve([]),
    enabledTypes.has(DashboardSliderType.POPULAR_TV) ? safe(() => getPopularTv()) : Promise.resolve([]),
    enabledTypes.has(DashboardSliderType.TOP_RATED_MOVIES) ? safe(() => getTopRatedMovies()) : Promise.resolve([]),
    enabledTypes.has(DashboardSliderType.TOP_RATED_TV) ? safe(() => getTopRatedTv()) : Promise.resolve([]),
    enabledTypes.has(DashboardSliderType.UPCOMING_MOVIES) ? safe(() => getUpcomingMoviesUkLatest()) : Promise.resolve([]),
    enabledTypes.has(DashboardSliderType.UPCOMING_TV) ? safe(() => getUpcomingTvAccurate()) : Promise.resolve([])
  ]);

  const trending = (trendingRaw ?? [])
    .filter((item: any) => (item?.media_type === "movie" || item?.media_type === "tv") && item.id)
    .slice(0, 20)
    .map((item: any) => ({
      id: item.id,
      title: item.media_type === "movie" ? item.title ?? "Untitled" : item.name ?? "Untitled",
      year: item.media_type === "movie"
        ? (item.release_date ?? "").slice(0, 4)
        : (item.first_air_date ?? "").slice(0, 4),
      rating: item.vote_average ?? 0,
      poster: tmdbImageUrl(item.poster_path, "w500", imageProxyEnabled),
      backdrop: tmdbImageUrl(item.backdrop_path, "w1280", imageProxyEnabled),
      href: item.media_type === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`,
      overview: item.overview,
      type: item.media_type as "movie" | "tv"
    }));
  
  // Fetch ratings server-side for hero carousel items (first 10)
  const heroItems = trending.slice(0, 10);
  const heroRatings = await Promise.all(
    heroItems.map(async (item) => {
      const year = parseInt(item.year) || undefined;
      if (!item.title || !year) return null;
      try {
        if (item.type === "movie") {
          return await getMovieRatings(item.title, year);
        } else {
          return await getTVRatings(item.title, year);
        }
      } catch {
        return null;
      }
    })
  ).catch(() => heroItems.map(() => null));
  const popularMovies = toCards(popularMoviesRaw, "movie", imageProxyEnabled);
  const popularTv = toCards(popularTvRaw, "tv", imageProxyEnabled);
  const topRatedMovies = toCards(topRatedMoviesRaw, "movie", imageProxyEnabled);
  const topRatedTv = toCards(topRatedTvRaw, "tv", imageProxyEnabled);
  const upcomingMovies = toCards(upcomingMoviesRaw, "movie", imageProxyEnabled);
  const upcomingTv = toCards(upcomingTvRaw, "tv", imageProxyEnabled);

  // Network data - Complete Jellyseerr-style networks list
  const networks = [
    // Streaming Services
    { id: 213, name: "Netflix", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/wwemzKWzjKYJFfCeiB57q3r4Bcm.png" },
    { id: 2739, name: "Disney+", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/gJ8VX6JSu3ciXHuC2dDGAo2lvwM.png" },
    { id: 1024, name: "Amazon Prime Video", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/ifhbNuuVnlwYy5oXA5VIb2YR8AZ.png" },
    { id: 2552, name: "Apple TV+", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/4KAy34EHvRM25Ih8wb82AuGU7zJ.png" },
    { id: 453, name: "Hulu", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/pqUTCleNUiTLAVlelGxUgWn1ELh.png" },
    { id: 49, name: "HBO", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/tuomPhY2UtuPTqqFnKMVHvSb724.png" },
    { id: 4330, name: "Paramount+", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/fi83B1oztoS47xxcemFdPMhIzK.png" },
    // Traditional Networks
    { id: 6, name: "NBC", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/o3OedEP0f9mfZr33jz2BfXOUK5.png" },
    { id: 16, name: "CBS", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/nm8d7P7MJNiBLdgIzUK0gkuEA4r.png" },
    { id: 2, name: "ABC", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/ndAvF4JLsliGreX87jAc9GdjmJY.png" },
    { id: 19, name: "FOX", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/1DSpHrWyOORkL9N2QHX7Adt31mQ.png" },
    { id: 4353, name: "Discovery+", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/1D1bS3Dyw4ScYnFWTlBOvJXC3nb.png" },
    { id: 67, name: "Showtime", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/Allse9kbjiP6ExaQrnSpIhkurEi.png" },
    { id: 174, name: "AMC", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/pmvRmATOCaDykE6JrVoeYxlFHw3.png" },
    { id: 318, name: "Starz", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/8GJjw3HHsAJYwIWKIPBPfqMxlEa.png" },
    { id: 71, name: "The CW", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/ge9hzeaU7nMtQ4PjkFlc68dGAJ9.png" },
    { id: 359, name: "Cinemax", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/6mSHSquNpfLgDdv6VnOOvC5Uz2h.png" },
    { id: 56, name: "Cartoon Network", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/c5OC6oVCg6QP4eqzW6XIq17CQjI.png" },
    { id: 80, name: "Adult Swim", logoUrl: "https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/9AKyspxVzywuaMuZ1Bvilu8sXly.png" },
  ].filter((network, index, arr) => {
    const name = network.name.toLowerCase().trim();
    return arr.findIndex(item => item.id === network.id || item.name.toLowerCase().trim() === name) === index;
  });

  // Build slider components map
  const sliderComponentsMap: Record<number, React.ReactNode> = {};
  
  sliders.forEach(s => {
    let component: React.ReactNode = null;
    
    switch (Number(s.type)) {
      case DashboardSliderType.RECENTLY_ADDED:
        component = <RecentAddedCarouselClient key={s.id} />;
        break;
      case DashboardSliderType.FAVORITES:
        component = <MediaListCarouselClient key={s.id} listType="favorite" title="Favorites" />;
        break;
      case DashboardSliderType.WATCHLIST:
        component = <MediaListCarouselClient key={s.id} listType="watchlist" title="Watchlist" />;
        break;
      case DashboardSliderType.RECENT_REQUESTS:
        component = <RecentRequestsSliderClient key={s.id} />;
        break;
      case DashboardSliderType.CONTINUE_WATCHING:
        component = <ContinueWatchingCarouselClient key={s.id} />;
        break;
      case DashboardSliderType.RECENTLY_VIEWED:
        component = <RecentlyViewedCarousel key={s.id} imageProxyEnabled={imageProxyEnabled} />;
        break;
      case DashboardSliderType.TRENDING:
        component = (
          <MediaCarousel
            key={s.id}
            title="Trending"
            items={trending.map(m => ({
              id: m.id,
              title: m.title,
              posterUrl: m.poster,
              year: m.year,
              rating: m.rating,
              description: m.overview,
              type: m.type
            }))}
          />
        );
        break;
      case DashboardSliderType.POPULAR_MOVIES:
        component = (
          <MediaCarousel
            key={s.id}
            title="Popular Movies"
            viewAllHref="/popular/movie"
            items={popularMovies.map(m => ({
              id: m.id,
              title: m.title,
              posterUrl: m.poster,
              year: m.year,
              rating: m.rating,
              description: m.overview,
              type: "movie" as const
            }))}
          />
        );
        break;
      case DashboardSliderType.POPULAR_TV:
        component = (
          <MediaCarousel
            key={s.id}
            title="Popular TV Shows"
            viewAllHref="/popular/tv"
            items={popularTv.map(m => ({
              id: m.id,
              title: m.title,
              posterUrl: m.poster,
              year: m.year,
              rating: m.rating,
              description: m.overview,
              type: "tv" as const
            }))}
          />
        );
        break;
      case DashboardSliderType.MOVIE_GENRES:
        component = <DashboardGenreRail key={s.id} type="movie" />;
        break;
      case DashboardSliderType.UPCOMING_MOVIES:
        component = (
          <MediaCarousel
            key={s.id}
            title="Upcoming Movies"
            viewAllHref="/upcoming/movie"
            lazy
            items={upcomingMovies.map(m => ({
              id: m.id,
              title: m.title,
              posterUrl: m.poster,
              year: m.year,
              rating: m.rating,
              description: m.overview,
              type: "movie" as const
            }))}
          />
        );
        break;
      case DashboardSliderType.TV_GENRES:
        component = <DashboardGenreRail key={s.id} type="tv" />;
        break;
      case DashboardSliderType.UPCOMING_TV:
        component = (
          <MediaCarousel
            key={s.id}
            title="Upcoming TV Shows"
            viewAllHref="/upcoming/tv"
            lazy
            items={upcomingTv.map(m => ({
              id: m.id,
              title: m.title,
              posterUrl: m.poster,
              year: m.year,
              rating: m.rating,
              description: m.overview,
              type: "tv" as const
            }))}
          />
        );
        break;
      case DashboardSliderType.TOP_RATED_MOVIES:
        component = (
          <MediaCarousel
            key={s.id}
            title="Top Rated Movies"
            viewAllHref="/top-rated/movie"
            lazy
            items={topRatedMovies.map(m => ({
              id: m.id,
              title: m.title,
              posterUrl: m.poster,
              year: m.year,
              rating: m.rating,
              description: m.overview,
              type: "movie" as const
            }))}
          />
        );
        break;
      case DashboardSliderType.TOP_RATED_TV:
        component = (
          <MediaCarousel
            key={s.id}
            title="Top Rated TV Shows"
            viewAllHref="/top-rated/tv"
            lazy
            items={topRatedTv.map(m => ({
              id: m.id,
              title: m.title,
              posterUrl: m.poster,
              year: m.year,
              rating: m.rating,
              description: m.overview,
              type: "tv" as const
            }))}
          />
        );
        break;
      case DashboardSliderType.NETWORKS:
        component = <NetworksSlider key={s.id} items={networks} />;
        break;
      case DashboardSliderType.TMDB_MOVIE_GENRE:
      case DashboardSliderType.TMDB_TV_GENRE:
      case DashboardSliderType.TMDB_MOVIE_KEYWORD:
      case DashboardSliderType.TMDB_TV_KEYWORD:
      case DashboardSliderType.TMDB_STUDIO:
      case DashboardSliderType.TMDB_NETWORK:
      case DashboardSliderType.TMDB_SEARCH:
        component = <DashboardTmdbCustomCarousel key={s.id} slider={s} imageProxyEnabled={imageProxyEnabled} />;
        break;
    }
    
    if (component) {
      sliderComponentsMap[s.id] = component;
    }
  });

  return (
    <div className="discover-page-root">
      {/* Hero Carousel with Trending Content */}
      <div className="discover-hero-bleed">
        <DiscoverHeroCarousel
          items={heroItems
            .filter((item: any) => item.backdrop ?? item.poster)
            .map((item: any, index: number) => ({
              id: item.id,
              title: item.title,
              overview: item.overview,
              backdropUrl: item.backdrop,
              posterUrl: item.poster,
              rating: item.rating,
              year: item.year,
              type: item.type,
              externalRatings: heroRatings[index]
            }))}
        />
      </div>
      <div className="discover-hero-mobile-fade md:hidden" aria-hidden="true" />

      {/* Regular content */}
      <div className="discover-page-container mt-8">
        <WatchStatsWidget />
        <DashboardCustomizeClient sliderComponents={sliderComponentsMap} initialSliders={sliders} />
      </div>
    </div>
  );
}
