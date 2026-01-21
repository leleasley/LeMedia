"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ChevronDown, ChevronUp, Star, Tv, Eye, Users, CheckCircle, Info, Check, X, Loader2 } from "lucide-react";
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
import { useToast } from "@/components/Providers/ToastProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Episode = {
    episode_number: number;
    name: string;
    overview: string;
    still_path: string | null;
    air_date: string;
    vote_average: number;
    available?: boolean;
    jellyfinItemId?: string | null;
    requested?: boolean;
    requestStatus?: string | null;
    requestId?: string | null;
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
    availableSeasons = [],
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
    availableSeasons?: number[];
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
    const [monitorEpisodes, setMonitorEpisodes] = useState<boolean>(true);
    const [status, setStatus] = useState<string>("");
    const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");

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
    const [episodeRequestModal, setEpisodeRequestModal] = useState<{ open: boolean; seasonNumber: number } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [requestInfoLoaded, setRequestInfoLoaded] = useState(Boolean(prefetchedAggregate));
    const router = useRouter();
    const toast = useToast();
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
    const [availableSeasonsState, setAvailableSeasonsState] = useState<number[]>(availableSeasons);

    const aggregateParams = new URLSearchParams();
    if (tvdbId) aggregateParams.set("tvdbId", String(tvdbId));
    if (tv?.name) aggregateParams.set("title", String(tv.name));
    const aggregateKey = `/api/v1/tv/${tv.id}${aggregateParams.toString() ? `?${aggregateParams.toString()}` : ""}`;
    const { data: aggregate } = useSWR<any>(aggregateKey, fetcher, {
        revalidateOnFocus: true,
        revalidateIfStale: true,
        refreshInterval: 30000,
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
        if (Array.isArray(sonarr.availableSeasons)) {
            setAvailableSeasonsState(sonarr.availableSeasons);
        }
        if (typeof sonarr.defaultQualityProfileId === "number" && sonarr.defaultQualityProfileId > 0) {
            setSelectedQualityProfileId(prev => (prev > 0 ? prev : sonarr.defaultQualityProfileId));
        }

        if (typeof aggregate.availableInLibrary === "boolean") {
            setAvailableInLibraryState(aggregate.availableInLibrary);
        }
        if (Array.isArray(aggregate.availableSeasons)) {
            setAvailableSeasonsState(aggregate.availableSeasons);
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
    const canRequestSeries = !isExisting && hasQualityProfiles;

    // Determine if partially available (some seasons available but not all)
    const totalSeasons = seasons.filter(s => s.season_number !== 0).length;
    const availableSeasonsCount = availableSeasonsState.filter(s => s !== 0).length;
    const hasAvailableEpisodes = Object.values(seasonEpisodes).some((episodes) =>
        episodes.some(episode => episode.available)
    );
    const hasAnyAvailable =
        availableSeasonsCount > 0 ||
        hasAvailableEpisodes ||
        availableInJellyfinState === true ||
        availableInLibraryState;
    const isFullyAvailable = availableSeasonsCount > 0 && availableSeasonsCount >= totalSeasons;
    const isPartiallyAvailable = hasAnyAvailable && !isFullyAvailable;
    const showManageButton = (isPartiallyAvailable || isFullyAvailable) && isAdminState && manageItemIdState;

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
            // Use the fast endpoint that doesn't check Jellyfin per-episode
            const seasonParams = tvdbId ? `?tvdbId=${encodeURIComponent(String(tvdbId))}` : "";
            const res = await fetch(`/api/v1/tmdb/tv/${tv.id}/season/${seasonNumber}/fast${seasonParams}`);
            const data = await res.json();
            if (res.ok && data.episodes) {
                setSeasonEpisodes(prev => ({ ...prev, [seasonNumber]: data.episodes }));
                const hasAvailable = data.episodes.some((episode: Episode) => episode.available);
                if (hasAvailable) {
                    setAvailableSeasonsState(prev => {
                        if (prev.includes(seasonNumber)) return prev;
                        const nextSeasons = [...prev, seasonNumber].sort((a, b) => a - b);
                        return nextSeasons;
                    });
                }
            }
        } catch (err) {
            console.error("Failed to load episodes", err);
        } finally {
            const end = new Set(loadingSeasons);
            end.delete(seasonNumber);
            setLoadingSeasons(end);
        }
    };

    const toggleEpisode = (seasonNumber: number, episodeNumber: number, episode?: Episode) => {
        // Don't allow selecting episodes that are already requested or available
        if (episode?.requested || episode?.available) return;

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
        const selectable = episodes.filter(e => !e.requested && !e.available).map(e => e.episode_number);
        const allChecked = selectable.length > 0 && currentChecked.size === selectable.length;
        setCheckedEpisodes(prev => ({
            ...prev,
            [seasonNumber]: allChecked ? new Set() : new Set(selectable)
        }));
    };

    const requestEpisodes = async (seasonNumber: number) => {
        if (isSubmitting) return;
        if (requestsBlockedState) {
            setModal({ title: "Requesting blocked", message: blockedMessage });
            setStatus("");
            setSubmitState("error");
            setTimeout(() => setSubmitState("idle"), 2000);
            return;
        }
        if (!hasQualityProfiles) {
            setStatus("Configure Sonarr with a quality profile before requesting.");
            setSubmitState("error");
            setTimeout(() => setSubmitState("idle"), 2000);
            return;
        }
        const episodeNumbers = Array.from(checkedEpisodes[seasonNumber] || []).sort((a, b) => a - b);
        if (episodeNumbers.length === 0) {
            setStatus("Select at least one episode.");
            setSubmitState("error");
            setTimeout(() => setSubmitState("idle"), 2000);
            return;
        }
        setIsSubmitting(true);
        setSubmitState("loading");
        setStatus("");
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
                    setSubmitState("error");
                    setTimeout(() => setSubmitState("idle"), 2000);
                    return;
                }
                if (res.status === 409 && (data.error === "already_requested" || data.error === "already_in_sonarr")) {
                    setModal({ title: data.error === "already_in_sonarr" ? "Already in Sonarr" : "Already requested", message: data.message || "These episodes have already been requested or already exist." });
                    setSubmitState("error");
                    setTimeout(() => setSubmitState("idle"), 2000);
                    return;
                }
                throw new Error(data.error || data.message || "Request failed");
            }
            if (data.pending) {
                toast.success("Request sent for approval! An admin needs to approve before it is added.", { timeoutMs: 4000 });
            } else {
                toast.success(`Successfully requested ${data.count} episode${data.count !== 1 ? 's' : ''}!`, { timeoutMs: 3000 });
            }
            setSeasonEpisodes(prev => {
                const episodes = prev[seasonNumber];
                if (!episodes) return prev;
                const nextEpisodes = episodes.map(episode => {
                    if (!episodeNumbers.includes(episode.episode_number)) {
                        return episode;
                    }
                    return {
                        ...episode,
                        requested: true,
                        requestStatus: data.pending ? "pending" : "submitted"
                    };
                });
                return { ...prev, [seasonNumber]: nextEpisodes };
            });
            setSubmitState("success");
            setCheckedEpisodes(prev => ({ ...prev, [seasonNumber]: new Set() }));
            router.refresh();
            setTimeout(() => {
                setEpisodeRequestModal(null);
                setSubmitState("idle");
            }, 1500);
        } catch (err: any) {
            toast.error(`Failed to submit request: ${err?.message ?? String(err)}`, { timeoutMs: 4000 });
            setSubmitState("error");
            setTimeout(() => setSubmitState("idle"), 2000);
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
        const episodeNumbers = episodes
            .filter(e => !e.requested && !e.available)
            .map(e => e.episode_number)
            .sort((a, b) => a - b);
        if (episodeNumbers.length === 0) {
            setStatus("No requestable episodes found for this season.");
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
            if (data.pending) {
                toast.success("Request sent for approval! An admin needs to approve before it is added.", { timeoutMs: 4000 });
            } else {
                toast.success(`Successfully requested ${data.count} episode${data.count !== 1 ? 's' : ''}!`, { timeoutMs: 3000 });
            }
            setStatus("");
            setSeasonQuickOpen(false);
            router.refresh();
        } catch (err: any) {
            toast.error(`Failed to submit request: ${err?.message ?? String(err)}`, { timeoutMs: 4000 });
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

            {/* Episode Request Confirmation Modal */}
            <Modal
                open={episodeRequestModal?.open ?? false}
                title="Confirm Episode Request"
                onClose={() => setEpisodeRequestModal(null)}
                backgroundImage={backdrop ?? poster ?? undefined}
            >
                <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                        <p className="text-sm text-gray-300">
                            You are about to request <span className="font-bold text-purple-300">{getCheckedCount(episodeRequestModal?.seasonNumber ?? 0)} episode{getCheckedCount(episodeRequestModal?.seasonNumber ?? 0) !== 1 ? 's' : ''}</span> from {tv.name}.
                        </p>
                    </div>

                    {qualityProfilesState.length > 0 && (
                        <div className="text-sm text-gray-300">
                            <div className="mb-2 font-semibold">Quality Profile</div>
                            <Select
                                value={String(selectedQualityProfileId)}
                                onValueChange={(value) => setSelectedQualityProfileId(Number(value))}
                                disabled={isSubmitting}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select quality profile" />
                                </SelectTrigger>
                                <SelectContent>
                                    {qualityProfilesState.map((profile) => (
                                        <SelectItem key={profile.id} value={String(profile.id)}>
                                            {profile.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg hover:bg-white/5 transition-colors">
                        <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${monitorEpisodes ? 'bg-purple-500 border-purple-500' : 'border-gray-500 group-hover:border-purple-400'}`}>
                            {monitorEpisodes && <CheckCircle className="h-4 w-4 text-white" />}
                        </div>
                        <div className="flex-1">
                            <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors block">Monitor episodes</span>
                            <span className="text-xs text-gray-400">Automatically search for episodes when they become available</span>
                        </div>
                        <input type="checkbox" checked={monitorEpisodes} onChange={(e) => setMonitorEpisodes(e.target.checked)} className="hidden" />
                    </label>

                    {status && (
                        <div className="text-sm text-gray-300 p-3 rounded-lg bg-white/5">
                            {status}
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={() => {
                                setEpisodeRequestModal(null);
                                setSubmitState("idle");
                            }}
                            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                if (episodeRequestModal) {
                                    requestEpisodes(episodeRequestModal.seasonNumber);
                                }
                            }}
                            className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                                submitState === "success"
                                    ? "bg-green-600 hover:bg-green-700 shadow-green-600/20"
                                    : submitState === "error"
                                    ? "bg-red-600 hover:bg-red-700 shadow-red-600/20"
                                    : "bg-purple-600 hover:bg-purple-700 shadow-purple-600/20"
                            }`}
                            disabled={!hasQualityProfiles || isSubmitting}
                        >
                            {submitState === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                            {submitState === "success" && <Check className="h-4 w-4" />}
                            {submitState === "error" && <X className="h-4 w-4" />}
                            <span>
                                {submitState === "loading"
                                    ? "Requesting..."
                                    : submitState === "success"
                                    ? "Success"
                                    : submitState === "error"
                                    ? "Failed"
                                    : "Confirm Request"}
                            </span>
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal open={seasonQuickOpen} title={`${tv.name} — Quick Request`} onClose={() => setSeasonQuickOpen(false)}>
                <div className="space-y-4">
                    {qualityProfilesState.length > 0 && (
                        <div className="text-sm text-gray-300">
                            <div className="mb-2 font-semibold">Quality Profile</div>
                            <Select
                                value={String(selectedQualityProfileId)}
                                onValueChange={(value) => setSelectedQualityProfileId(Number(value))}
                                disabled={isSubmitting}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select quality profile" />
                                </SelectTrigger>
                                <SelectContent>
                                    {qualityProfilesState.map((profile) => (
                                        <SelectItem key={profile.id} value={String(profile.id)}>
                                            {profile.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {seasons.map(season => {
                            const isSeasonAvailable = availableSeasonsState.includes(season.season_number);
                            return (
                                <div key={season.season_number} className="rounded-lg overflow-hidden border border-white/10 bg-white/5">
                                    <div className="relative aspect-[2/3] bg-neutral-900">
                                        {season.poster_path ? (
                                            <Image src={`https://image.tmdb.org/t/p/w300${season.poster_path}`} alt="" fill className="object-cover" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-gray-500"><Tv className="h-6 w-6" /></div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                                        {isSeasonAvailable && (
                                            <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-green-500/90 px-2 py-1 text-xs font-semibold text-white">
                                                <CheckCircle className="h-3 w-3" />
                                                Available
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 space-y-1">
                                        <div className="font-semibold text-white text-sm truncate">{season.name || `Season ${season.season_number}`}</div>
                                        <div className="text-xs text-gray-400">{season.episode_count} episodes</div>
                                        {isSeasonAvailable ? (
                                            <button className="mt-2 w-full px-3 py-1.5 rounded bg-green-600 text-white text-xs font-bold cursor-not-allowed opacity-70" disabled>Already Available</button>
                                        ) : (
                                            <button onClick={() => requestFullSeason(season.season_number)} className="mt-2 w-full px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold active:scale-95 disabled:opacity-50" disabled={requestsBlockedState || qualityProfilesState.length === 0 || isSubmitting}>Request Season</button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
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
                            {isFullyAvailable ? (
                                <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-indigo-400 bg-indigo-500 px-3 text-xs font-semibold text-white shadow-sm">
                                    <CheckCircle className="h-4 w-4" />
                                    Available
                                </div>
                            ) : isPartiallyAvailable ? (
                                <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-indigo-400 bg-indigo-500 px-3 text-xs font-semibold text-white shadow-sm">
                                    <CheckCircle className="h-4 w-4" />
                                    Partially Available
                                </div>
                            ) : null}
                            {isExisting && existingSeriesState?.monitored && !hasAnyAvailable && (
                                <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-purple-400 bg-purple-500 px-3 text-xs font-semibold text-white shadow-sm">
                                    <Eye className="h-4 w-4" />
                                    Monitored
                                </div>
                            )}
                            {isExisting && existingSeriesState?.monitored === false && !hasAnyAvailable && (
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
                            {hasAnyAvailable ? (
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
                                        manageItemId={showManageButton ? manageItemIdState ?? null : null}
                                        manageSlug={showManageButton ? manageSlugState ?? null : null}
                                        manageBaseUrl={showManageButton ? manageBaseUrlState ?? null : null}
                                    />
                                    {isPartiallyAvailable && canRequestSeries && (
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
                                                title={tv.name}
                                                posterUrl={poster}
                                                backdropUrl={backdrop}
                                                isLoading={!requestInfoLoaded}
                                                monitor={monitorEpisodes}
                                                onRequestPlaced={() => {
                                                    setRequestModalOpen(false);
                                                    router.refresh();
                                                }}
                                            />
                                        </>
                                    )}
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
                                    {canRequestSeries && (
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
                                                title={tv.name}
                                                posterUrl={poster}
                                                backdropUrl={backdrop}
                                                isLoading={!requestInfoLoaded}
                                                monitor={monitorEpisodes}
                                                onRequestPlaced={() => {
                                                    setRequestModalOpen(false);
                                                    router.refresh();
                                                }}
                                            />
                                        </>
                                    )}
                                    {!isExisting && qualityProfilesState.length === 0 && requestInfoLoaded && (
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
                                    const selectableCount = episodes.filter(e => !e.requested).length;
                                    const allChecked = selectableCount > 0 && checkedCount === selectableCount;
                                    return (
                                        <div key={season.season_number} className="overflow-hidden rounded-xl border border-white/10 bg-black/20 backdrop-blur-sm transition-all hover:bg-black/30">
                                            <button onClick={() => toggleSeason(season.season_number)} className="w-full flex items-center justify-between p-3 sm:p-6 transition-colors">
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
                                                <div className="border-t border-white/10 bg-black/20 p-3 sm:p-6 animate-in slide-in-from-top-2 duration-200">
                                                    {isLoading ? (
                                                        <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />Loading episodes...</div>
                                                    ) : episodes.length === 0 ? (
                                                        <div className="text-center py-12 text-gray-400">No episodes found</div>
                                                    ) : (
                                                        <>
                                                            <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-white/5">
                                                                <div className="flex flex-col gap-3">
                                                                    <label className="flex items-center gap-3 cursor-pointer group">
                                                                        <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${allChecked ? 'bg-white border-white' : 'border-gray-500 group-hover:border-white'}`}>{allChecked && <CheckCircle className="h-3.5 w-3.5 text-black" />}</div>
                                                                        <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">Select All Episodes</span>
                                                                        <input type="checkbox" checked={allChecked} onChange={() => toggleAllInSeason(season.season_number)} className="hidden" />
                                                                    </label>
                                                                    {checkedCount > 0 && (
                                                                        <label className="flex items-center gap-3 cursor-pointer group ml-8">
                                                                            <div className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${monitorEpisodes ? 'bg-purple-500 border-purple-500' : 'border-gray-500 group-hover:border-purple-400'}`}>{monitorEpisodes && <CheckCircle className="h-3 w-3 text-white" />}</div>
                                                                            <span className="text-xs font-medium text-gray-400 group-hover:text-gray-300 transition-colors">Monitor episodes after request</span>
                                                                            <input type="checkbox" checked={monitorEpisodes} onChange={(e) => setMonitorEpisodes(e.target.checked)} className="hidden" />
                                                                        </label>
                                                                    )}
                                                                </div>
                                                                {checkedCount > 0 && (
                                                                    <button onClick={() => setEpisodeRequestModal({ open: true, seasonNumber: season.season_number })} className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!hasQualityProfiles || isSubmitting}>Request {checkedCount} Episode{checkedCount !== 1 ? 's' : ''}</button>
                                                                )}
                                                            </div>
                                                            <div className="divide-y divide-white/10">
                                                                {episodes.map((episode) => {
                                                                    const isChecked = checkedEpisodes[season.season_number]?.has(episode.episode_number);
                                                                    const stillUrl = episode.still_path ? `https://image.tmdb.org/t/p/w300${episode.still_path}` : null;
                                                                    const airBadge = getAiringBadge(episode.air_date);
                                                                    const isRequested = episode.requested ?? false;
                                                                    const isAvailable = episode.available ?? false;
                                                                    const isDisabled = isRequested || isAvailable;

                                                                    return (
                                                                        <label
                                                                            key={episode.episode_number}
                                                                            className={`relative flex gap-3 sm:gap-5 py-3 sm:py-5 transition-colors ${
                                                                                isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-white/5"
                                                                            } ${isChecked ? "bg-purple-500/10" : ""}`}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={isChecked}
                                                                                onChange={() => toggleEpisode(season.season_number, episode.episode_number, episode)}
                                                                                className="hidden"
                                                                                disabled={isDisabled}
                                                                            />
                                                                            <div className={`mt-1 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                                                                                isAvailable ? "bg-green-500/20 border-green-400" :
                                                                                isDisabled ? "bg-gray-700 border-gray-600" :
                                                                                isChecked ? "bg-purple-500 border-purple-500" : "border-gray-500"
                                                                            }`}>
                                                                                {isAvailable ? (
                                                                                    <Check className="h-4 w-4 text-green-200" />
                                                                                ) : (isChecked || isDisabled) ? (
                                                                                    <CheckCircle className="h-4 w-4 text-white" />
                                                                                ) : null}
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex flex-wrap items-center gap-2">
                                                                                    <h4 className={`text-base font-semibold leading-snug ${isChecked ? "text-purple-100" : "text-gray-100"}`}>
                                                                                        {episode.episode_number} - {episode.name || "Untitled"}
                                                                                    </h4>
                                                                                    {isAvailable && (
                                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 border border-green-500/40 px-2.5 py-0.5 text-xs font-semibold text-green-300">
                                                                                            <CheckCircle className="h-3 w-3" />
                                                                                            Available
                                                                                        </span>
                                                                                    )}
                                                                                    {isRequested && (
                                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 border border-blue-500/40 px-2.5 py-0.5 text-xs font-semibold text-blue-300">
                                                                                            <Info className="h-3 w-3" />
                                                                                            Already requested
                                                                                        </span>
                                                                                    )}
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
                                                                            <div className="hidden sm:block w-28 sm:w-44 h-16 sm:h-24 relative rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0">
                                                                                {stillUrl ? (
                                                                                    <Image src={stillUrl} alt={episode.name} fill className="object-cover" />
                                                                                ) : (
                                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                                        <Tv className="h-6 w-6 text-gray-600" />
                                                                                    </div>
                                                                                )}
                                                                                {isChecked && (
                                                                                    <div className="absolute inset-0 bg-purple-500/20" />
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
                        <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 sm:gap-3">
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
