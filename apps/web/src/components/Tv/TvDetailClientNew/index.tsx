"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ChevronDown, ChevronUp, Star, Tv, Eye, Users, CheckCircle, Info } from "lucide-react";
import { Modal } from "@/components/Common/Modal";
import { readJson } from "@/lib/fetch-utils";
import { csrfFetch } from "@/lib/csrf-client";
import { MediaInfoBox } from "@/components/Media/MediaInfoBox";
import { MediaActionMenu } from "@/components/Media/MediaActionMenu";
import { MediaListButtons } from "@/components/Media/MediaListButtons";
import { RequestMediaModal } from "@/components/Requests/RequestMediaModal";
import { PlayButton } from "@/components/Media/PlayButton";
import ButtonWithDropdown from "@/components/Common/ButtonWithDropdown";
import { ArrowDownTrayIcon, FilmIcon } from "@heroicons/react/24/outline";
import { useTrackView } from "@/hooks/useTrackView";
import { ShareButton } from "@/components/Media/ShareButton";

type Episode = {
    episode_number: number;
    name: string;
    overview: string;
    still_path: string | null;
    air_date: string;
    vote_average: number;
};

type Season = {
    season_number: number;
    episode_count: number;
    name: string;
    poster_path: string | null;
};

type QualityProfile = { id: number; name: string };

function initials(name: string): string {
    const parts = name.trim().split(/\s+/g).filter(Boolean);
    if (!parts.length) return "?";
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");
}

const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    return res.json();
};

export function TvDetailClientNew({
    tv,
    poster,
    backdrop,
    trailerUrl,
    playUrl,
    seasons,
    qualityProfiles,
    defaultQualityProfileId,
    requestsBlocked,
    sonarrError,
    existingSeries,
    availableInJellyfin,
    streamingProviders = [],
    rtCriticsScore,
    rtCriticsRating,
    rtAudienceScore,
    rtAudienceRating,
    rtUrl,
    metacriticScore,
    imdbRating,
    keywords = [],
    availableInLibrary = false,
    isAdmin = false,
    manageItemId,
    manageSlug,
    manageBaseUrl,
    tvdbId,
    externalRatingsSlot,
    keywordsSlot,
    prefetchedAggregate,
    children
}: {
    tv: any;
    poster: string | null;
    backdrop: string | null;
    trailerUrl: string | null;
    playUrl?: string | null;
    seasons: Season[];
    qualityProfiles: QualityProfile[];
    defaultQualityProfileId: number;
    requestsBlocked: boolean;
    sonarrError?: string | null;
    existingSeries?: any;
    availableInJellyfin?: boolean | null;
    streamingProviders?: any[];
    rtCriticsScore?: number | null;
    rtCriticsRating?: string | null;
    rtAudienceScore?: number | null;
    rtAudienceRating?: string | null;
    rtUrl?: string | null;
    metacriticScore?: string | null;
    imdbRating?: string | null;
    keywords?: { id: number; name: string }[];
    availableInLibrary?: boolean;
    isAdmin?: boolean;
    manageItemId?: number | null;
    manageSlug?: string | null;
    manageBaseUrl?: string | null;
    tvdbId?: number | null;
    externalRatingsSlot?: React.ReactNode;
    keywordsSlot?: React.ReactNode;
    prefetchedAggregate?: any;
    children?: React.ReactNode;
}) {
    const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
    const [seasonEpisodes, setSeasonEpisodes] = useState<Record<number, Episode[]>>({});
    const [loadingSeasons, setLoadingSeasons] = useState<Set<number>>(new Set());
    const [checkedEpisodes, setCheckedEpisodes] = useState<Record<number, Set<number>>>({});
    const [selectedQualityProfileId, setSelectedQualityProfileId] = useState<number>(defaultQualityProfileId);
    const [status, setStatus] = useState<string>("");

    // Track view
    useTrackView({
        mediaType: "tv",
        tmdbId: tv.id,
        title: tv.name || tv.title || "Unknown",
        posterPath: poster,
    });
    const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
    const [seasonQuickOpen, setSeasonQuickOpen] = useState(false);
    const [requestModalOpen, setRequestModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [requestInfoLoaded, setRequestInfoLoaded] = useState(Boolean(prefetchedAggregate));
    const router = useRouter();
    const blockedMessage = "Requesting blocked until notifications are applied";

    const [qualityProfilesState, setQualityProfilesState] = useState<QualityProfile[]>(qualityProfiles);
    const [requestsBlockedState, setRequestsBlockedState] = useState<boolean>(requestsBlocked);
    const [sonarrErrorState, setSonarrErrorState] = useState<string | null>(sonarrError ?? null);
    const [existingSeriesState, setExistingSeriesState] = useState<any>(existingSeries ?? null);
    const [availableInJellyfinState, setAvailableInJellyfinState] = useState<boolean | null>(availableInJellyfin ?? null);
    const [playUrlState, setPlayUrlState] = useState<string | null>(playUrl ?? null);
    const [manageItemIdState, setManageItemIdState] = useState<number | null>(manageItemId ?? null);
    const [manageSlugState, setManageSlugState] = useState<string | null>(manageSlug ?? null);
    const [manageBaseUrlState, setManageBaseUrlState] = useState<string | null>(manageBaseUrl ?? null);
    const [isAdminState, setIsAdminState] = useState<boolean>(isAdmin);
    const [availableInLibraryState, setAvailableInLibraryState] = useState<boolean>(availableInLibrary);

    const aggregateParams = new URLSearchParams();
    if (tvdbId) aggregateParams.set("tvdbId", String(tvdbId));
    if (tv?.name) aggregateParams.set("title", String(tv.name));
    const aggregateKey = `/api/v1/tv/${tv.id}${aggregateParams.toString() ? `?${aggregateParams.toString()}` : ""}`;
    const { data: aggregate } = useSWR<any>(aggregateKey, fetcher, {
        revalidateOnFocus: false,
        fallbackData: prefetchedAggregate
    });

    useEffect(() => {
        if (aggregate !== undefined) {
            setRequestInfoLoaded(true);
        }
    }, [aggregate]);

    useEffect(() => {
        if (!aggregate) return;
        const sonarr = aggregate.sonarr ?? {};

        if (Array.isArray(sonarr.qualityProfiles)) {
            setQualityProfilesState(sonarr.qualityProfiles);
        }
        if (typeof sonarr.requestsBlocked === "boolean") {
            setRequestsBlockedState(sonarr.requestsBlocked);
        }
        if (sonarr.sonarrError !== undefined) {
            setSonarrErrorState(sonarr.sonarrError);
        }
        if (sonarr.existingSeries !== undefined) {
            setExistingSeriesState(sonarr.existingSeries);
        }
        if (sonarr.availableInJellyfin !== undefined) {
            setAvailableInJellyfinState(sonarr.availableInJellyfin);
        }
        if (typeof sonarr.defaultQualityProfileId === "number" && sonarr.defaultQualityProfileId > 0) {
            setSelectedQualityProfileId(prev => (prev > 0 ? prev : sonarr.defaultQualityProfileId));
        }

        if (typeof aggregate.availableInLibrary === "boolean") {
            setAvailableInLibraryState(aggregate.availableInLibrary);
        }
        if (typeof aggregate.isAdmin === "boolean") {
            setIsAdminState(aggregate.isAdmin);
        }
        if (aggregate.playUrl !== undefined) {
            setPlayUrlState(aggregate.playUrl);
        }
        if (aggregate.manage) {
            setManageItemIdState(aggregate.manage.itemId ?? null);
            setManageSlugState(aggregate.manage.slug ?? null);
            setManageBaseUrlState(aggregate.manage.baseUrl ?? null);
        }
    }, [aggregate]);

    const hasQualityProfiles = qualityProfilesState.length > 0;
    const isExisting = !!existingSeriesState;
    const cast = (tv.aggregate_credits?.cast ?? tv.credits?.cast ?? []).slice(0, 12);
    const creators = Array.isArray(tv.created_by) ? tv.created_by.slice(0, 6) : [];
    const crew = Array.isArray(tv.credits?.crew) ? tv.credits.crew : [];
    const crewRoles = new Set([
        "Executive Producer",
        "Producer",
        "Co-Executive Producer",
        "Associate Producer",
        "Co-Producer"
    ]);
    const crewEntries = [
        ...creators.map((person: any) => ({ job: "Creator", person })),
        ...crew.filter((person: any) => crewRoles.has(person.job)).map((person: any) => ({ job: person.job, person }))
    ].slice(0, 6);

    const toggleSeason = async (seasonNumber: number) => {
        const isExpanded = expandedSeasons.has(seasonNumber);
        if (isExpanded) {
            const next = new Set(expandedSeasons);
            next.delete(seasonNumber);
            setExpandedSeasons(next);
        } else {
            const next = new Set(expandedSeasons);
            next.add(seasonNumber);
            setExpandedSeasons(next);
            if (!seasonEpisodes[seasonNumber]) {
                await loadSeasonEpisodes(seasonNumber);
            }
        }
    };

    const loadSeasonEpisodes = async (seasonNumber: number) => {
        const next = new Set(loadingSeasons);
        next.add(seasonNumber);
        setLoadingSeasons(next);
        try {
            const res = await fetch(`/api/v1/tmdb/tv/${tv.id}/season/${seasonNumber}`);
            const data = await res.json();
            if (res.ok && data.episodes) {
                setSeasonEpisodes(prev => ({ ...prev, [seasonNumber]: data.episodes }));
            }
        } catch (err) {
            console.error("Failed to load episodes", err);
        } finally {
            const end = new Set(loadingSeasons);
            end.delete(seasonNumber);
            setLoadingSeasons(end);
        }
    };

    const toggleEpisode = (seasonNumber: number, episodeNumber: number) => {
        setCheckedEpisodes(prev => {
            const seasonChecked = new Set(prev[seasonNumber] || []);
            if (seasonChecked.has(episodeNumber)) seasonChecked.delete(episodeNumber);
            else seasonChecked.add(episodeNumber);
            return { ...prev, [seasonNumber]: seasonChecked };
        });
    };

    const toggleAllInSeason = (seasonNumber: number) => {
        const episodes = seasonEpisodes[seasonNumber] || [];
        const currentChecked = checkedEpisodes[seasonNumber] || new Set();
        const allChecked = episodes.length > 0 && currentChecked.size === episodes.length;
        setCheckedEpisodes(prev => ({ ...prev, [seasonNumber]: allChecked ? new Set() : new Set(episodes.map(e => e.episode_number)) }));
    };

    const requestEpisodes = async (seasonNumber: number) => {
        if (isSubmitting) return;
        if (requestsBlockedState) {
            setModal({ title: "Requesting blocked", message: blockedMessage });
            setStatus("");
            return;
        }
        if (!hasQualityProfiles) {
            setStatus("Configure Sonarr with a quality profile before requesting.");
            return;
        }
        const episodeNumbers = Array.from(checkedEpisodes[seasonNumber] || []).sort((a, b) => a - b);
        if (episodeNumbers.length === 0) {
            setStatus("Select at least one episode.");
            return;
        }
        setIsSubmitting(true);
        setStatus("Submitting to Sonarr...");
        try {
            const res = await csrfFetch("/api/v1/request/episodes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tmdbTvId: tv.id, seasonNumber, episodeNumbers, qualityProfileId: selectedQualityProfileId })
            });
            const data = await readJson(res);
            if (!res.ok) {
                if (res.status === 403 && data.error === "notifications_required") {
                    setModal({ title: "Requesting blocked", message: blockedMessage });
                    setStatus("");
                    return;
                }
                if (res.status === 409 && (data.error === "already_requested" || data.error === "already_in_sonarr")) {
                    setModal({ title: data.error === "already_in_sonarr" ? "Already in Sonarr" : "Already requested", message: data.message || "These episodes have already been requested or already exist." });
                    setStatus("");
                    return;
                }
                throw new Error(data.error || data.message || "Request failed");
            }
            if (data.pending) setModal({ title: "Sent for approval", message: "An admin needs to approve this request before it is added." });
            else setModal({ title: "Request submitted!", message: `Successfully requested ${data.count} episode${data.count !== 1 ? 's' : ''}. Request ID: ${data.requestId}` });
            setStatus("");
            setCheckedEpisodes(prev => ({ ...prev, [seasonNumber]: new Set() }));
            router.refresh();
        } catch (err: any) {
            setStatus(`Failed: ${err?.message ?? String(err)}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const requestFullSeason = async (seasonNumber: number) => {
        if (isSubmitting) return;
        if (requestsBlockedState) {
            setModal({ title: "Requesting blocked", message: blockedMessage });
            setStatus("");
            return;
        }
        if (!hasQualityProfiles) {
            setStatus("Configure Sonarr with a quality profile before requesting.");
            return;
        }
        if (!seasonEpisodes[seasonNumber] || seasonEpisodes[seasonNumber].length === 0) await loadSeasonEpisodes(seasonNumber);
        const episodes = seasonEpisodes[seasonNumber] || [];
        const episodeNumbers = episodes.map(e => e.episode_number).sort((a, b) => a - b);
        if (episodeNumbers.length === 0) {
            setStatus("No episodes found for this season.");
            return;
        }
        setIsSubmitting(true);
        setStatus("Submitting season to Sonarr...");
        try {
            const res = await csrfFetch("/api/v1/request/episodes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tmdbTvId: tv.id, seasonNumber, episodeNumbers, qualityProfileId: selectedQualityProfileId })
            });
            const data = await readJson(res);
            if (!res.ok) {
                if (res.status === 403 && data.error === "notifications_required") {
                    setModal({ title: "Requesting blocked", message: blockedMessage });
                    setStatus("");
                    return;
                }
                if (res.status === 409 && (data.error === "already_requested" || data.error === "already_in_sonarr")) {
                    setModal({ title: data.error === "already_in_sonarr" ? "Already in Sonarr" : "Already requested", message: data.message || "This season has already been requested or already exists." });
                    setStatus("");
                    return;
                }
                throw new Error(data.error || data.message || "Request failed");
            }
            if (data.pending) setModal({ title: "Sent for approval", message: "An admin needs to approve this request before it is added." });
            else setModal({ title: "Request submitted!", message: `Successfully requested ${data.count} episode${data.count !== 1 ? 's' : ''}. Request ID: ${data.requestId}` });
            setStatus("");
            setSeasonQuickOpen(false);
            router.refresh();
        } catch (err: any) {
            setStatus(`Failed: ${err?.message ?? String(err)}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getCheckedCount = (seasonNumber: number) => checkedEpisodes[seasonNumber]?.size || 0;
    const formatRating = (rating: number) => (rating ? rating.toFixed(1) : "N/A");
    const formatDate = (dateStr: string) => {
        if (!dateStr) return "Unknown";
        try { return new Date(dateStr).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" }); } catch { return dateStr; }
    };
    const getAiringBadge = (dateStr: string) => {
        if (!dateStr) return null;
        const air = new Date(dateStr);
        const now = new Date();
        const diffMs = air.getTime() - now.getTime();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (Number.isNaN(days) || days <= 0) return null;
        return `Airing in ${days} day${days !== 1 ? "s" : ""}`;
    };

    return (
        <div className="media-page">
            <Modal open={!!modal} title={modal?.title ?? ""} onClose={() => setModal(null)}>{modal?.message ?? ""}</Modal>
            <Modal open={seasonQuickOpen} title={`${tv.name} — Quick Request`} onClose={() => setSeasonQuickOpen(false)}>
                <div className="space-y-4">
                    {qualityProfilesState.length > 0 && (
                        <div className="text-sm text-gray-300">
                            <div className="mb-2 font-semibold">Quality Profile</div>
                            <select value={selectedQualityProfileId} onChange={e => setSelectedQualityProfileId(Number(e.target.value))} className="w-full input">
                                {qualityProfilesState.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                            </select>
                        </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {seasons.map(season => (
                            <div key={season.season_number} className="rounded-lg overflow-hidden border border-white/10 bg-white/5">
                                <div className="relative aspect-[2/3] bg-neutral-900">
                                    {season.poster_path ? (
                                        <Image src={`https://image.tmdb.org/t/p/w300${season.poster_path}`} alt="" fill className="object-cover" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-gray-500"><Tv className="h-6 w-6" /></div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                                </div>
                                <div className="p-3 space-y-1">
                                    <div className="font-semibold text-white text-sm truncate">{season.name || `Season ${season.season_number}`}</div>
                                    <div className="text-xs text-gray-400">{season.episode_count} episodes</div>
                                    <button onClick={() => requestFullSeason(season.season_number)} className="mt-2 w-full px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold active:scale-95 disabled:opacity-50" disabled={requestsBlockedState || qualityProfilesState.length === 0 || isSubmitting}>Request Season</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>

            {/* Backdrop with Seerr-style gradient overlay */}
            {(backdrop || poster) && (
                <div className="media-page-bg-image" style={{ height: 493 }}>
                    <Image 
                        src={backdrop || poster || ""} 
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
                                alt={tv.name}
                                width={600}
                                height={900}
                                className="w-full h-auto"
                                priority
                                sizes="(max-width: 768px) 128px, (max-width: 1024px) 176px, 208px"
                                style={{ width: "100%", height: "auto" }}
                            />
                        ) : (
                            <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center"><Tv className="h-16 w-16 text-gray-600" /></div>
                        )}
                        <div className="absolute left-2 top-2 pointer-events-none">
                            <div className="rounded-full border border-purple-600 bg-purple-600/80 shadow-md">
                                <div className="flex h-5 items-center px-2 text-xs font-medium uppercase tracking-wider text-white">
                                    SERIES
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Media Title Section */}
                    <div className="media-title">
                        <div className="media-status">
                            {availableInLibraryState ? (
                                <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-500 px-3 text-xs font-semibold text-white shadow-sm">
                                    <CheckCircle className="h-4 w-4" />
                                    Available
                                </div>
                            ) : null}
                            {isExisting && existingSeriesState?.monitored && (
                                <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-500 px-3 text-xs font-semibold text-white shadow-sm">
                                    <CheckCircle className="h-4 w-4" />
                                    Monitored
                                </div>
                            )}
                            {isExisting && existingSeriesState?.monitored === false && (
                                <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-amber-400 bg-amber-500 px-3 text-xs font-semibold text-white shadow-sm">
                                    Not monitored
                                </div>
                            )}
                        </div>
                        <h1>
                            {tv.name}{" "}
                            {tv.first_air_date && (
                                <span className="media-year">({new Date(tv.first_air_date).getFullYear()})</span>
                            )}
                        </h1>

                        {/* Attributes */}
                        <span className="media-attributes">
                            {tv.number_of_seasons > 0 && (
                                <span>
                                    {tv.number_of_seasons} {tv.number_of_seasons === 1 ? 'Season' : 'Seasons'}
                                </span>
                            )}
                            {tv.genres?.map((g: any) => (
                                <span key={g.id}>{g.name}</span>
                            ))}
                        </span>

                        {/* Action Buttons */}
                        <div className="media-actions">
                            {availableInLibraryState ? (
                                <>
                                    <MediaListButtons tmdbId={tv.id} mediaType="tv" />
                                    <ShareButton
                                        mediaType="tv"
                                        tmdbId={tv.id}
                                        title={tv.name}
                                        backdropPath={backdrop ?? null}
                                        posterUrl={poster ?? null}
                                    />
                                    <MediaActionMenu
                                        title={tv.name}
                                        mediaType="tv"
                                        tmdbId={tv.id}
                                        tvdbId={tvdbId ?? undefined}
                                        playUrl={playUrlState ?? undefined}
                                        trailerUrl={trailerUrl ?? undefined}
                                        backdropUrl={backdrop ?? undefined}
                                        isAdmin={isAdminState}
                                        showReport
                                        manageItemId={manageItemIdState ?? null}
                                        manageSlug={manageSlugState ?? null}
                                        manageBaseUrl={manageBaseUrlState ?? null}
                                    />
                                </>
                            ) : (
                                <>
                                    <MediaListButtons tmdbId={tv.id} mediaType="tv" />
                                    <ShareButton
                                        mediaType="tv"
                                        tmdbId={tv.id}
                                        title={tv.name}
                                        backdropPath={backdrop ?? null}
                                        posterUrl={poster ?? null}
                                    />
                                    {trailerUrl ? (
                                        <PlayButton
                                            links={[
                                                {
                                                    text: "Watch Trailer",
                                                    url: trailerUrl,
                                                    svg: <FilmIcon />
                                                }
                                            ]}
                                        />
                                    ) : null}
                                    {requestInfoLoaded && !isExisting && qualityProfilesState.length > 0 && (
                                        <>
                                            <ButtonWithDropdown
                                                text={
                                                    <>
                                                        <ArrowDownTrayIcon />
                                                        <span>Request</span>
                                                    </>
                                                }
                                                onClick={() => setRequestModalOpen(true)}
                                            />
                                            <RequestMediaModal
                                                open={requestModalOpen}
                                                onClose={() => setRequestModalOpen(false)}
                                                tmdbId={tv.id}
                                                mediaType="tv"
                                                qualityProfiles={qualityProfilesState}
                                                defaultQualityProfileId={selectedQualityProfileId}
                                                requestsBlocked={requestsBlockedState}
                                                isAdmin={isAdminState}
                                                title={tv.name}
                                                posterUrl={poster}
                                                backdropUrl={backdrop}
                                                onRequestPlaced={() => {
                                                    setRequestModalOpen(false);
                                                    router.refresh();
                                                }}
                                            />
                                        </>
                                    )}
                                    {requestInfoLoaded && !isExisting && qualityProfilesState.length === 0 && (
                                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-amber-200 text-sm">
                                            ⚠️ Configure Sonarr first
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="media-overview">
                    {/* Left Column - Seasons */}
                    <div className="media-overview-left">
                        <div className="mb-8">
                            {tv.tagline && <div className="tagline">{tv.tagline}</div>}
                            <h2>Overview</h2>
                            <p>{tv.overview || "No overview available."}</p>
                            {crewEntries.length > 0 && (
                                <div className="mt-6">
                                    <ul className="media-crew">
                                        {crewEntries.map(({ job, person }) => (
                                            <li key={`${job}-${person.id}`}>
                                                <span className="crew-job">{job}</span>
                                                <Link href={`/person/${person.id}`} className="crew-name">
                                                    {person.name}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-2 flex justify-end">
                                        <a
                                            href={`https://www.themoviedb.org/tv/${tv.id}/cast`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white"
                                        >
                                            View Full Crew
                                            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
                                                <path
                                                    fill="currentColor"
                                                    d="M7.2 5.7a1 1 0 0 1 1.4 0l4.4 4.4a1 1 0 0 1 0 1.4l-4.4 4.4a1 1 0 1 1-1.4-1.4l3.7-3.7-3.7-3.7a1 1 0 0 1 0-1.4z"
                                                />
                                            </svg>
                                        </a>
                                    </div>
                                </div>
                            )}
                            {keywordsSlot || (keywords.length > 0 && (
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-1.5 text-gray-300">
                                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
                                            <path
                                                fill="currentColor"
                                                d="M21 11l-9.2 9.2a2 2 0 0 1-2.8 0L3 14.2a2 2 0 0 1 0-2.8L12.2 2H19a2 2 0 0 1 2 2v7zM7.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
                                            />
                                        </svg>
                                    </span>
                                    {keywords.map((keyword) => (
                                        <span
                                            key={keyword.id}
                                            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-200"
                                        >
                                            {keyword.name}
                                        </span>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <h2>Seasons</h2>
                        <div className="space-y-4">
                            {seasons.length === 0 ? (
                                <div className="p-8 rounded-xl border border-white/5 bg-white/5 text-center text-gray-400">No seasons available for this show.</div>
                            ) : (
                                seasons.map((season) => {
                                    const isExpanded = expandedSeasons.has(season.season_number);
                                    const isLoading = loadingSeasons.has(season.season_number);
                                    const episodes = seasonEpisodes[season.season_number] || [];
                                    const checkedCount = getCheckedCount(season.season_number);
                                    const allChecked = episodes.length > 0 && checkedCount === episodes.length;
                                    return (
                                        <div key={season.season_number} className="overflow-hidden rounded-xl border border-white/10 bg-black/20 backdrop-blur-sm transition-all hover:bg-black/30">
                                            <button onClick={() => toggleSeason(season.season_number)} className="w-full flex items-center justify-between p-6 transition-colors">
                                                <div className="flex items-center gap-6">
                                                    {season.poster_path ? (
                                                        <div className="h-16 w-12 rounded bg-neutral-800 flex-shrink-0 relative overflow-hidden hidden sm:block"><Image src={`https://image.tmdb.org/t/p/w200${season.poster_path}`} alt="" fill className="object-cover" /></div>
                                                    ) : (
                                                        <div className="h-16 w-12 rounded bg-white/5 flex-shrink-0 hidden sm:flex items-center justify-center"><Tv className="h-5 w-5 text-gray-500" /></div>
                                                    )}
                                                    <div className="text-left">
                                                        <div className="text-lg font-bold text-white">{season.name || `Season ${season.season_number}`}</div>
                                                        <div className="text-sm text-gray-400 mt-1 flex items-center gap-2"><span>{season.episode_count} Episodes</span>{checkedCount > 0 && (<span className="text-emerald-400 font-medium bg-emerald-400/10 px-2 py-0.5 rounded text-xs">{checkedCount} Selected</span>)}</div>
                                                    </div>
                                                </div>
                                                {isExpanded ? (<ChevronUp className="h-5 w-5 text-gray-400" />) : (<ChevronDown className="h-5 w-5 text-gray-400" />)}
                                            </button>
                                            {isExpanded && (
                                                <div className="border-t border-white/10 bg-black/20 p-6 animate-in slide-in-from-top-2 duration-200">
                                                    {isLoading ? (
                                                        <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />Loading episodes...</div>
                                                    ) : episodes.length === 0 ? (
                                                        <div className="text-center py-12 text-gray-400">No episodes found</div>
                                                    ) : (
                                                        <>
                                                            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
                                                                <label className="flex items-center gap-3 cursor-pointer group">
                                                                    <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${allChecked ? 'bg-white border-white' : 'border-gray-500 group-hover:border-white'}`}>{allChecked && <CheckCircle className="h-3.5 w-3.5 text-black" />}</div>
                                                                    <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">Select All Episodes</span>
                                                                    <input type="checkbox" checked={allChecked} onChange={() => toggleAllInSeason(season.season_number)} className="hidden" />
                                                                </label>
                                                                {checkedCount > 0 && (
                                                                    <button onClick={() => requestEpisodes(season.season_number)} className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!hasQualityProfiles || isSubmitting}>Request {checkedCount} Episode{checkedCount !== 1 ? 's' : ''}</button>
                                                                )}
                                                            </div>
                                                            <div className="divide-y divide-white/10">
                                                                {episodes.map((episode) => {
                                                                    const isChecked = checkedEpisodes[season.season_number]?.has(episode.episode_number);
                                                                    const stillUrl = episode.still_path ? `https://image.tmdb.org/t/p/w300${episode.still_path}` : null;
                                                                    const airBadge = getAiringBadge(episode.air_date);
                                                                    return (
                                                                        <label
                                                                            key={episode.episode_number}
                                                                            className={`relative flex gap-5 py-5 cursor-pointer transition-colors ${isChecked ? "bg-emerald-500/10" : "hover:bg-white/5"}`}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={isChecked}
                                                                                onChange={() => toggleEpisode(season.season_number, episode.episode_number)}
                                                                                className="hidden"
                                                                            />
                                                                            <div className={`mt-1 h-5 w-5 rounded border flex items-center justify-center transition-colors ${isChecked ? "bg-emerald-400 border-emerald-400" : "border-gray-500"}`}>
                                                                                {isChecked && <CheckCircle className="h-4 w-4 text-black" />}
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex flex-wrap items-center gap-2">
                                                                                    <h4 className={`text-base font-semibold leading-snug ${isChecked ? "text-emerald-100" : "text-gray-100"}`}>
                                                                                        {episode.episode_number} - {episode.name || "Untitled"}
                                                                                    </h4>
                                                                                    <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-gray-200">
                                                                                        {formatDate(episode.air_date)}
                                                                                    </span>
                                                                                    {airBadge && (
                                                                                        <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-gray-200">
                                                                                            {airBadge}
                                                                                        </span>
                                                                                    )}
                                                                                    {episode.vote_average > 0 && (
                                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-400">
                                                                                            <Star className="h-3 w-3 fill-current" />
                                                                                            {formatRating(episode.vote_average)}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <p className="mt-2 text-sm text-gray-400 leading-relaxed line-clamp-3">
                                                                                    {episode.overview || "No overview available."}
                                                                                </p>
                                                                            </div>
                                                                            <div className="hidden md:block w-44 h-24 relative rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0">
                                                                                {stillUrl ? (
                                                                                    <Image src={stillUrl} alt={episode.name} fill className="object-cover" />
                                                                                ) : (
                                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                                        <Tv className="h-6 w-6 text-gray-600" />
                                                                                    </div>
                                                                                )}
                                                                                {isChecked && (
                                                                                    <div className="absolute inset-0 bg-emerald-500/20" />
                                                                                )}
                                                                            </div>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right Column - Info Box */}
                    <div className="media-overview-right">
                        <MediaInfoBox
                            status={tv.status}
                            firstAirDate={tv.first_air_date}
                            originalLanguage={tv.original_language}
                            productionCountries={tv.production_countries}
                            networks={tv.networks}
                            streamingProviders={streamingProviders}
                            voteAverage={tv.vote_average}
                            tmdbId={tv.id}
                            imdbId={tv.external_ids?.imdb_id}
                            imdbRating={imdbRating ?? null}
                            rtCriticsScore={rtCriticsScore ?? null}
                            rtCriticsRating={rtCriticsRating ?? null}
                            rtAudienceScore={rtAudienceScore ?? null}
                            rtAudienceRating={rtAudienceRating ?? null}
                            rtUrl={rtUrl ?? null}
                            metacriticScore={metacriticScore ?? null}
                            type="tv"
                            tvdbId={tvdbId}
                            jellyfinUrl={playUrlState}
                            externalRatingsSlot={externalRatingsSlot}
                        />
                    </div>
                </div>

                {/* Cast Section - At the Bottom */}
                {cast.length > 0 && (
                    <div className="mt-10 sm:mt-16 md:mt-24">
                        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide mb-4 sm:mb-6">Cast</h2>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 sm:gap-3">
                            {cast.map((person: any) => {
                                const img = person.profile_path ? `https://image.tmdb.org/t/p/w300${person.profile_path}` : null;
                                const name = person.name ?? "Unknown";
                                const character = person.roles ? person.roles[0]?.character : (person.character ?? "");
                                const episodeCount = person.roles ? person.total_episode_count : null;
                                const label = character ? `${name} as ${character}` : name;
                                return (
                                    <Link
                                        key={person.id}
                                        href={`/person/${person.id}`}
                                        aria-label={`View ${label}`}
                                        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                                    >
                                        <div className="relative aspect-[2/3] overflow-hidden rounded-md sm:rounded-lg border border-white/10 bg-white/5 transition-transform duration-300 group-hover:scale-105 group-hover:border-white/20">
                                            {img ? (
                                                <Image src={img} alt={name} fill className="object-cover transition-transform duration-300 group-hover:scale-110" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-semibold text-xs sm:text-sm">{initials(name)}</div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-70" />
                                        </div>
                                        <div className="mt-1 text-center">
                                            <div className="text-[10px] sm:text-xs font-semibold text-white truncate">{name}</div>
                                            <div className="text-[9px] sm:text-[11px] text-gray-400 truncate">{character}{episodeCount && <span className="opacity-70"> • {episodeCount} eps</span>}</div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}
                {children}
                <div className="extra-bottom-space relative" />
        </div>
    );
}
