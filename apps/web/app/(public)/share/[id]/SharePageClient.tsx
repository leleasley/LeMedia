"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { Star, Calendar, Clock, Play, Film, Tv, Users, Building2 } from "lucide-react";
import { tmdbImageUrl } from "@/lib/tmdb-images";

function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    let id: string | null = null;
    if (host === "youtu.be") {
      id = u.pathname.replace(/^\/+/, "") || null;
    } else if (host.endsWith("youtube.com")) {
      id = u.searchParams.get("v");
      if (!id && u.pathname.startsWith("/embed/")) id = u.pathname.split("/embed/")[1] || null;
    }

    if (!id) return null;
    id = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!id) return null;

    const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    embed.searchParams.set("autoplay", "1");
    embed.searchParams.set("rel", "0");
    embed.searchParams.set("modestbranding", "1");
    return embed.toString();
  } catch {
    return null;
  }
}

function findTrailerVideo(videos: any): string | null {
  if (!videos?.results || videos.results.length === 0) return null;

  // Prioritize YouTube trailers
  const youtubeVideos = videos.results.filter((v: any) => v.site === "YouTube");

  // First, look for official trailers
  const trailer = youtubeVideos.find((v: any) =>
    v.type === "Trailer" && v.official
  );

  if (trailer?.key) {
    return `https://www.youtube.com/watch?v=${trailer.key}`;
  }

  // Fallback to any trailer
  const anyTrailer = youtubeVideos.find((v: any) => v.type === "Trailer");
  if (anyTrailer?.key) {
    return `https://www.youtube.com/watch?v=${anyTrailer.key}`;
  }

  // Last resort: any video
  const anyVideo = youtubeVideos[0];
  if (anyVideo?.key) {
    return `https://www.youtube.com/watch?v=${anyVideo.key}`;
  }

  return null;
}

interface SharePageClientProps {
  media: any;
  mediaType: "movie" | "tv";
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  imageProxyEnabled: boolean;
}

export function SharePageClient({
  media,
  mediaType,
  title,
  posterUrl,
  backdropUrl,
  imageProxyEnabled,
}: SharePageClientProps) {
  const [trailerOpen, setTrailerOpen] = useState(false);

  // Lock body scroll when trailer is open
  useEffect(() => {
    if (trailerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [trailerOpen]);

  // Close on escape key
  useEffect(() => {
    if (!trailerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTrailerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [trailerOpen]);

  const releaseDate = mediaType === "movie" ? media.release_date : media.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : "N/A";
  const rating = media.vote_average ? Math.round(media.vote_average * 10) / 10 : 0;
  const runtime = mediaType === "movie" ? media.runtime : media.episode_run_time?.[0];

  const trailerUrl = findTrailerVideo(media.videos);
  const trailerEmbedUrl = useMemo(() =>
    trailerUrl ? youtubeEmbedUrl(trailerUrl) : null,
    [trailerUrl]
  );

  // Get director or creator
  const director = mediaType === "movie"
    ? media.credits?.crew?.find((p: any) => p.job === "Director")
    : media.credits?.crew?.find((p: any) => p.job === "Director") || media.created_by?.[0];

  // Get production companies
  const productionCompanies = media.production_companies?.slice(0, 3) || [];

  // Get certification/rating
  const certification = mediaType === "movie"
    ? media.releases?.countries?.find((c: any) => c.iso_3166_1 === "US")?.certification
    : media.content_ratings?.results?.find((r: any) => r.iso_3166_1 === "US")?.rating;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Backdrop */}
      {backdropUrl && (
        <div className="fixed inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backdropUrl})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/95 to-slate-950/80" />
          <div className="absolute inset-0 backdrop-blur-3xl" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 py-12 md:py-16">
          <div className="grid lg:grid-cols-[350px_1fr] gap-8 md:gap-12">
            {/* Left Column - Poster */}
            <div className="flex flex-col gap-6">
              <div className="flex justify-center lg:justify-start">
                {posterUrl ? (
                  <div className="w-full max-w-[350px] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                    <Image
                      src={posterUrl}
                      alt={title}
                      width={350}
                      height={525}
                      className="w-full h-auto"
                      priority
                    />
                  </div>
                ) : (
                  <div className="w-full max-w-[350px] aspect-[2/3] bg-slate-800 rounded-2xl flex items-center justify-center text-gray-500">
                    {mediaType === "movie" ? (
                      <Film className="h-24 w-24 opacity-20" />
                    ) : (
                      <Tv className="h-24 w-24 opacity-20" />
                    )}
                  </div>
                )}
              </div>

              {/* Trailer Button */}
              {trailerEmbedUrl && (
                <button
                  onClick={() => setTrailerOpen(true)}
                  className="flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-white text-black font-bold hover:bg-gray-100 transition-all shadow-lg hover:shadow-white/20 active:scale-95"
                >
                  <Play className="h-5 w-5 fill-current" />
                  Play Trailer
                </button>
              )}
            </div>

            {/* Right Column - Details */}
            <div className="space-y-8">
              {/* Title & Meta */}
              <div>
                <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
                  {title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-gray-300">
                  {certification && (
                    <span className="px-2 py-0.5 rounded border border-gray-500 text-xs font-semibold">
                      {certification}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {year}
                  </span>
                  {runtime && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {runtime} min
                    </span>
                  )}
                  {rating > 0 && (
                    <span className="flex items-center gap-1.5 text-yellow-400 font-semibold">
                      <Star className="h-4 w-4 fill-current" />
                      {rating}
                    </span>
                  )}
                </div>
              </div>

              {/* Genres */}
              {media.genres && media.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {media.genres.slice(0, 5).map((genre: any) => (
                    <span
                      key={genre.id}
                      className="px-4 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-sm font-medium"
                    >
                      {genre.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Overview */}
              {media.overview && (
                <div className="rounded-xl bg-slate-900/50 border border-white/10 p-6">
                  <h2 className="text-xl font-semibold text-white mb-3">Overview</h2>
                  <p className="text-gray-300 leading-relaxed text-base">{media.overview}</p>
                </div>
              )}

              {/* Director/Creator */}
              {director && (
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-400">
                      {mediaType === "movie" ? "Director" : "Creator"}
                    </div>
                    <div className="text-white font-medium">{director.name}</div>
                  </div>
                </div>
              )}

              {/* Cast */}
              {media.credits?.cast && media.credits.cast.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Top Cast
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {media.credits.cast.slice(0, 6).map((person: any) => {
                      const profileUrl = person.profile_path
                        ? tmdbImageUrl(person.profile_path, "w185", imageProxyEnabled)
                        : null;

                      return (
                        <div
                          key={person.id}
                          className="rounded-lg bg-slate-800/60 border border-white/5 p-3 hover:bg-slate-800 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {profileUrl ? (
                              <Image
                                src={profileUrl}
                                alt={person.name}
                                width={48}
                                height={48}
                                className="rounded-full w-12 h-12 object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
                                <Users className="h-5 w-5 text-gray-500" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-white font-medium text-sm truncate">
                                {person.name}
                              </div>
                              <div className="text-gray-400 text-xs truncate">
                                {person.character}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Production Companies */}
              {productionCompanies.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Production
                  </h2>
                  <div className="flex flex-wrap gap-4">
                    {productionCompanies.map((company: any) => {
                      const logoUrl = company.logo_path
                        ? tmdbImageUrl(company.logo_path, "w185", imageProxyEnabled)
                        : null;

                      return (
                        <div
                          key={company.id}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg bg-slate-800/40 border border-white/5"
                        >
                          {logoUrl ? (
                            <Image
                              src={logoUrl}
                              alt={company.name}
                              width={60}
                              height={30}
                              className="max-h-8 w-auto object-contain brightness-0 invert opacity-70"
                            />
                          ) : (
                            <span className="text-gray-300 text-sm">{company.name}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Branding */}
              <div className="pt-6 border-t border-white/10">
                <p className="text-sm text-gray-500">
                  Shared via <span className="text-indigo-400 font-semibold">LeMedia</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trailer Modal */}
      {trailerEmbedUrl && trailerOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setTrailerOpen(false)}
        >
          <div
            className="w-full max-w-5xl rounded-xl bg-slate-900 border border-white/10 shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{title} — Trailer</h2>
              <button
                type="button"
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setTrailerOpen(false)}
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="relative w-full aspect-video overflow-hidden rounded-lg border border-white/10 bg-black">
              <iframe
                className="absolute inset-0 h-full w-full"
                src={trailerEmbedUrl}
                title={`${title} trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
