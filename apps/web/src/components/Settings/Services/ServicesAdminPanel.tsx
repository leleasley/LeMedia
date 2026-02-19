"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Modal } from "@/components/Common/Modal";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import useSWR from "swr";
import RadarrLogo from "@/assets/services/radarr.svg";
import SonarrLogo from "@/assets/services/sonarr.svg";
import ProwlarrLogo from "@/assets/services/prowlarr.svg";
import SabnzbdLogo from "@/assets/services/sabnzbd.svg";
import QbittorrentLogo from "@/assets/services/qbittorrent.svg";
import NzbgetLogo from "@/assets/services/nzbget.svg";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { Loader2, CheckCircle2, XCircle, Database, Film, Tv, RefreshCcw, Server, Download } from "lucide-react";

type MediaService = {
    id: number;
    name: string;
    type: "radarr" | "sonarr" | "prowlarr" | "sabnzbd" | "qbittorrent" | "nzbget";
    base_url: string;
    config: Record<string, unknown>;
    enabled: boolean;
    created_at: string;
    updated_at: string;
};

type ProwlarrIndexer = {
    id: number;
    name?: string;
    implementation?: string;
    implementationName?: string;
    protocol?: string;
    enable?: boolean;
    supportsRss?: boolean;
    supportsSearch?: boolean;
    priority?: number;
    tags?: number[];
};

type ServiceHealthDetail = {
    id: number;
    name: string;
    type: "radarr" | "sonarr" | string;
    healthy: boolean;
    enabled: boolean;
    statusText?: string;
    queueSize: number;
    failedCount: number;
    disk?: {
        path?: string;
        freeBytes?: number;
        totalBytes?: number;
    };
};

type HealthResponse = {
    database: boolean;
    tmdb: boolean;
    jellyfin: boolean;
    services: Record<string, boolean>;
    serviceDetails?: ServiceHealthDetail[];
};

type ModalState = { mode: "create" } | { mode: "edit"; service: MediaService };

type FormState = {
    name: string;
    type: MediaService["type"];
    apiKey: string;
    username: string;
    enabled: boolean;
    hostname: string;
    port: string;
    useSsl: boolean;
    urlBase: string;
    serverName: string;
    defaultServer: boolean;
    fourKServer: boolean;
    qualityProfileId: string;
    rootFolder: string;
    minimumAvailability: string;
    tags: string;
    externalUrl: string;
    enableScan: boolean;
    enableAutomaticSearch: boolean;
    tagRequests: boolean;
    seriesType: string;
    animeSeriesType: string;
    animeQualityProfileId: string;
    animeRootFolder: string;
    animeTags: string;
    seasonFolders: boolean;
    monitoringOption: string;
};

type TraktConfig = {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    hasClientSecret?: boolean;
    appAuthorizedAt?: string | null;
};

const initialForm: FormState = {
    name: "",
    type: "radarr",
    apiKey: "",
    username: "",
    enabled: true,
    hostname: "",
    port: "",
    useSsl: true,
    urlBase: "",
    serverName: "",
    defaultServer: false,
    fourKServer: false,
    qualityProfileId: "",
    rootFolder: "",
    minimumAvailability: "",
    tags: "",
    externalUrl: "",
    enableScan: true,
    enableAutomaticSearch: true,
    tagRequests: false,
    seriesType: "standard",
    animeSeriesType: "",
    animeQualityProfileId: "",
    animeRootFolder: "",
    animeTags: "",
    seasonFolders: true,
    monitoringOption: "all"
};

const cloneInitialForm = (): FormState => ({ ...initialForm });
const toStringValue = (value?: unknown) => (value == null ? "" : String(value));

const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Request failed");
    return data;
};

function formatBytes(bytes?: number) {
    if (typeof bytes !== "number" || Number.isNaN(bytes)) return "—";
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

const logoMap: Record<MediaService["type"], any> = {
    radarr: RadarrLogo,
    sonarr: SonarrLogo,
    prowlarr: ProwlarrLogo,
    sabnzbd: SabnzbdLogo,
    qbittorrent: QbittorrentLogo,
    nzbget: NzbgetLogo
};

const typeLabelMap: Record<FormState["type"], string> = {
    radarr: "Radarr",
    sonarr: "Sonarr",
    prowlarr: "Prowlarr",
    sabnzbd: "SABnzbd",
    qbittorrent: "qBittorrent",
    nzbget: "NZBGet"
};

const portPlaceholderMap: Record<FormState["type"], string> = {
    radarr: "7878",
    sonarr: "8989",
    prowlarr: "9696",
    sabnzbd: "8080",
    qbittorrent: "8080",
    nzbget: "6789"
};

const urlBasePlaceholderMap: Record<FormState["type"], string> = {
    radarr: "/radarr",
    sonarr: "/sonarr",
    prowlarr: "/prowlarr",
    sabnzbd: "",
    qbittorrent: "",
    nzbget: ""
};

const serviceDescriptions: Record<MediaService["type"], string> = {
    radarr: "Movie collection manager",
    sonarr: "TV series collection manager",
    prowlarr: "Indexer manager for *arr apps",
    sabnzbd: "Usenet download client",
    qbittorrent: "BitTorrent download client",
    nzbget: "Usenet download client"
};

const serviceGradients: Record<string, { from: string; to: string; text: string }> = {
    radarr: { from: "from-amber-500/20", to: "to-orange-500/20", text: "text-amber-400" },
    sonarr: { from: "from-sky-500/20", to: "to-blue-500/20", text: "text-sky-400" },
    prowlarr: { from: "from-purple-500/20", to: "to-indigo-500/20", text: "text-purple-400" },
    sabnzbd: { from: "from-yellow-500/20", to: "to-amber-500/20", text: "text-yellow-400" },
    qbittorrent: { from: "from-blue-500/20", to: "to-cyan-500/20", text: "text-blue-400" },
    nzbget: { from: "from-green-500/20", to: "to-emerald-500/20", text: "text-green-400" }
};

const monitoringOptions = [
    { value: "all", label: "All Episodes" },
    { value: "future", label: "Future Episodes" },
    { value: "missing", label: "Missing Episodes" },
    { value: "existing", label: "Existing Episodes" },
    { value: "recent", label: "Recent Episodes" },
    { value: "pilot", label: "Pilot Episode" },
    { value: "firstSeason", label: "First Season" },
    { value: "lastSeason", label: "Last Season" },
    { value: "monitorSpecials", label: "Monitor Specials" },
    { value: "unmonitorSpecials", label: "Unmonitor Specials" },
    { value: "none", label: "None" }
];

export function ServicesAdminPanel({ initialServices }: { initialServices: MediaService[] }) {
    const toast = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [traktConfig, setTraktConfig] = useState<TraktConfig>({
        enabled: false,
        clientId: "",
        clientSecret: "",
        redirectUri: ""
    });
    const [traktSaving, setTraktSaving] = useState(false);
    const { data, mutate, isLoading } = useSWR<{ services: MediaService[] }>("/api/v1/admin/services", fetcher, {
        fallbackData: { services: initialServices },
        revalidateOnFocus: false
    });
    const { data: traktData } = useSWR<{ config: Partial<TraktConfig> }>("/api/v1/admin/settings/trakt", fetcher, {
        revalidateOnFocus: false
    });

    useEffect(() => {
        const cfg = traktData?.config ?? {};
        setTraktConfig({
            enabled: !!cfg.enabled,
            clientId: cfg.clientId ?? "",
            clientSecret: "",
            redirectUri: cfg.redirectUri ?? "",
            hasClientSecret: cfg.hasClientSecret ?? false,
            appAuthorizedAt: cfg.appAuthorizedAt ?? null
        });
    }, [traktData]);

    const hasSecret = Boolean(traktConfig.hasClientSecret || traktConfig.clientSecret.trim());
    const traktConfigured = traktConfig.enabled && Boolean(traktConfig.clientId.trim()) && hasSecret;
    const traktAuthorized = traktConfigured && Boolean(traktConfig.appAuthorizedAt);
    const canStartTraktOAuth = traktConfigured;

    useEffect(() => {
        const trakt = searchParams.get("trakt");
        const errorMsg = searchParams.get("error");
        if (trakt === "linked") {
            toast.success("Trakt OAuth approved");
        } else if (errorMsg) {
            toast.error(errorMsg);
        }
        if (trakt || errorMsg) {
            const url = new URL(window.location.href);
            url.searchParams.delete("trakt");
            url.searchParams.delete("error");
            router.replace(url.pathname + url.search);
        }
    }, [searchParams, toast, router]);

    const handleSaveTrakt = async (event: FormEvent) => {
        event.preventDefault();
        setTraktSaving(true);
        const shouldAuthorizeAfterSave =
            traktConfig.enabled &&
            Boolean(traktConfig.clientId.trim()) &&
            Boolean(traktConfig.clientSecret.trim() || traktConfig.hasClientSecret) &&
            !traktConfig.appAuthorizedAt;
        try {
            const payload = {
                enabled: traktConfig.enabled,
                clientId: traktConfig.clientId.trim(),
                clientSecret: traktConfig.clientSecret.trim(),
                redirectUri: traktConfig.redirectUri.trim()
            };
            const res = await csrfFetch("/api/v1/admin/settings/trakt", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Trakt settings");
            }
            if (body?.config) {
                setTraktConfig(prev => ({
                    ...prev,
                    enabled: body.config.enabled ?? prev.enabled,
                    clientId: body.config.clientId ?? prev.clientId,
                    redirectUri: body.config.redirectUri ?? prev.redirectUri,
                    clientSecret: "",
                    hasClientSecret: body.config.hasClientSecret ?? prev.hasClientSecret,
                    appAuthorizedAt: body.config.appAuthorizedAt ?? prev.appAuthorizedAt
                }));
            }
            toast.success("Trakt settings saved");
            if (shouldAuthorizeAfterSave) {
                handleTraktOAuth();
                return;
            }
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to save Trakt settings");
        } finally {
            setTraktSaving(false);
        }
    };

    const handleTraktOAuth = () => {
        if (typeof window === "undefined") return;
        const returnTo = "/admin/settings/services";
        window.location.assign(`/api/v1/profile/trakt/connect?returnTo=${encodeURIComponent(returnTo)}`);
    };

    const { data: healthData, mutate: mutateHealth } = useSWR<HealthResponse>("/api/admin/status/health", fetcher, {
        refreshInterval: 30000
    });

    const services = useMemo(() => data?.services ?? [], [data]);
    const prowlarrEnabled = services.some(service => service.type === "prowlarr");

    const { data: indexerData, mutate: mutateIndexers, error: indexerError } = useSWR<{ indexers: ProwlarrIndexer[] }>(
        prowlarrEnabled ? "/api/v1/admin/prowlarr/indexers" : null,
        fetcher,
        { revalidateOnFocus: false }
    );

    const [modal, setModal] = useState<ModalState | null>(null);
    const [form, setForm] = useState<FormState>(cloneInitialForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [testMessage, setTestMessage] = useState<string | null>(null);
    const [statusMap, setStatusMap] = useState<Record<number, { state: "idle" | "checking" | "ok" | "error"; message?: string }>>({});
    const [expandedSection, setExpandedSection] = useState<string>("status");
    const [showIndexers, setShowIndexers] = useState(false);
    const [editIndexer, setEditIndexer] = useState<ProwlarrIndexer | null>(null);
    const [indexerForm, setIndexerForm] = useState({ enable: false, priority: 1 });
    const [savingIndexer, setSavingIndexer] = useState(false);
    const [bulkIndexerSaving, setBulkIndexerSaving] = useState(false);
    const [retryingId, setRetryingId] = useState<number | null>(null);

    const buildBaseUrl = useCallback((f: FormState) => {
        const trimmedHost = f.hostname.trim();
        if (!trimmedHost) return "";
        const trimmedPort = f.port.trim();
        const normalizedPath = f.urlBase.trim();
        const path = normalizedPath ? (normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`) : "";
        return `${f.useSsl ? "https" : "http"}://${trimmedHost}${trimmedPort ? `:${trimmedPort}` : ""}${path}`;
    }, []);

    const computedBaseUrl = buildBaseUrl(form);
    const typeLabel = typeLabelMap[form.type];
    const modalTitle = modal?.mode === "edit" ? `Edit ${typeLabel} Server` : `Add ${typeLabel} Server`;
    const isDownloader = ["sabnzbd", "qbittorrent", "nzbget"].includes(form.type);
    const needsUsername = form.type === "qbittorrent" || form.type === "nzbget";
    const apiKeyLabel = needsUsername ? "Password" : "API Key";

    const handleClose = useCallback(() => {
        setModal(null);
        setForm(cloneInitialForm());
        setError(null);
        setTestMessage(null);
        setTesting(false);
    }, []);

    const openCreate = (type: MediaService["type"]) => {
        setForm({ ...cloneInitialForm(), type });
        setError(null);
        setTestMessage(null);
        setTesting(false);
        setModal({ mode: "create" });
    };

    const openEdit = (service: MediaService) => {
        const cfg = service.config ?? {};
        let parsed = { hostname: "", port: "", useSsl: true, urlBase: "" };
        try {
            const url = new URL(service.base_url);
            parsed = {
                hostname: url.hostname,
                port: url.port,
                useSsl: url.protocol === "https:",
                urlBase: url.pathname === "/" ? "" : url.pathname
            };
        } catch {
            parsed.useSsl = service.base_url?.startsWith("https") ?? true;
        }

        setForm({
            name: service.name,
            type: service.type,
            apiKey: "",
            enabled: service.enabled,
            hostname: parsed.hostname,
            port: parsed.port,
            useSsl: parsed.useSsl,
            urlBase: parsed.urlBase,
            serverName: toStringValue(cfg.serverName),
            defaultServer: Boolean(cfg.defaultServer),
            fourKServer: Boolean(cfg.fourKServer),
            qualityProfileId: toStringValue(cfg.qualityProfileId ?? cfg.qualityProfile),
            rootFolder: toStringValue(cfg.rootFolder),
            minimumAvailability: toStringValue(cfg.minimumAvailability),
            tags: Array.isArray(cfg.tags) ? cfg.tags.join(", ") : toStringValue(cfg.tags),
            externalUrl: toStringValue(cfg.externalUrl),
            enableScan: Boolean(cfg.enableScan ?? true),
            enableAutomaticSearch: Boolean(cfg.enableAutomaticSearch ?? true),
            tagRequests: Boolean(cfg.tagRequests),
            seriesType: toStringValue(cfg.seriesType ?? "standard"),
            animeSeriesType: toStringValue(cfg.animeSeriesType),
            animeQualityProfileId: toStringValue(cfg.animeQualityProfileId),
            animeRootFolder: toStringValue(cfg.animeRootFolder),
            animeTags: Array.isArray(cfg.animeTags) ? cfg.animeTags.join(", ") : toStringValue(cfg.animeTags),
            seasonFolders: Boolean(cfg.seasonFolders ?? true),
            monitoringOption: toStringValue(cfg.monitoringOption ?? "all"),
            username: toStringValue(cfg.username)
        });
        setError(null);
        setTestMessage(null);
        setTesting(false);
        setModal({ mode: "edit", service });
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!modal) return;
        setSubmitting(true);
        setError(null);

        if (!computedBaseUrl) {
            setError("Hostname is required.");
            setSubmitting(false);
            return;
        }

        const config: Record<string, any> = {
            serverName: form.serverName.trim() || undefined,
            defaultServer: form.defaultServer,
            fourKServer: form.fourKServer,
            qualityProfileId: parseInt(form.qualityProfileId, 10) || form.qualityProfileId,
            rootFolder: form.rootFolder.trim() || undefined,
            minimumAvailability: form.minimumAvailability.trim() || undefined,
            tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
            externalUrl: form.externalUrl.trim() || undefined,
            enableScan: form.enableScan,
            enableAutomaticSearch: form.enableAutomaticSearch,
            tagRequests: form.tagRequests,
            seriesType: form.seriesType.trim() || undefined,
            animeSeriesType: form.animeSeriesType.trim() || undefined,
            animeQualityProfileId: parseInt(form.animeQualityProfileId, 10) || form.animeQualityProfileId,
            animeRootFolder: form.animeRootFolder.trim() || undefined,
            animeTags: form.animeTags.split(",").map(t => t.trim()).filter(Boolean),
            seasonFolders: form.seasonFolders,
            monitoringOption: form.monitoringOption,
            username: form.username.trim() || undefined
        };

        const payload: Record<string, unknown> = {
            name: form.name.trim(),
            type: form.type,
            baseUrl: computedBaseUrl,
            enabled: form.enabled,
            config
        };
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();

        const endpoint = modal.mode === "create" ? "/api/v1/admin/services" : `/api/v1/admin/services/${modal.service.id}`;
        const method = modal.mode === "create" ? "POST" : "PATCH";

        try {
            const res = await csrfFetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                throw new Error(b?.error || "Failed to save");
            }
            toast.success("Service saved");
            handleClose();
            await mutate();
        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const runTest = useCallback(async () => {
        setTestMessage(null);
        if (!computedBaseUrl) {
            setTestMessage("Hostname required.");
            return;
        }

        const apiKeyToUse = form.apiKey.trim();
        const usernameToUse = form.username.trim();
        if (!apiKeyToUse && (!modal || modal.mode !== 'edit')) {
            setTestMessage("API key required.");
            return;
        }
        if (needsUsername && !usernameToUse && (!modal || modal.mode !== "edit")) {
            setTestMessage("Username required.");
            return;
        }

        setTesting(true);
        try {
            const payload: any = { type: form.type, baseUrl: computedBaseUrl, apiKey: apiKeyToUse };
            if (needsUsername && usernameToUse) payload.username = usernameToUse;
            if (modal?.mode === 'edit') payload.id = modal.service.id;

            const res = await csrfFetch("/api/v1/admin/services/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });
            if (!res.ok) throw new Error("Connection failed");
            setTestMessage("Connection succeeded.");
        } catch (err: any) {
            setTestMessage(err.message);
        } finally {
            setTesting(false);
        }
    }, [computedBaseUrl, form.apiKey, form.type, form.username, modal, needsUsername]);

    const pingService = useCallback(async (service: MediaService) => {
        setStatusMap(prev => ({ ...prev, [service.id]: { state: "checking" } }));
        try {
            const res = await csrfFetch(`/api/v1/admin/services/${service.id}/ping`, { credentials: "include" });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.ok) throw new Error("Offline");
            setStatusMap(prev => ({ ...prev, [service.id]: { state: "ok" } }));
        } catch {
            setStatusMap(prev => ({ ...prev, [service.id]: { state: "error" } }));
        }
    }, []);

    const handleRetry = async (detail: ServiceHealthDetail) => {
        setRetryingId(detail.id);
        try {
            const res = await fetch("/api/admin/status/retry-downloads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serviceId: detail.id })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.error) throw new Error(body?.error || "Failed to trigger retry");
            toast.success("Retry started");
            mutateHealth();
        } catch (err: any) {
            toast.error(err?.message ?? "Retry failed");
        } finally {
            setRetryingId(null);
        }
    };

    const saveIndexer = useCallback(async (event: FormEvent) => {
        event.preventDefault();
        if (!editIndexer || savingIndexer) return;
        setSavingIndexer(true);
        try {
            const res = await csrfFetch("/api/v1/admin/prowlarr/indexers", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editIndexer.id, enable: indexerForm.enable, priority: indexerForm.priority })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || "Failed to update indexer");
            toast.success("Indexer updated");
            setEditIndexer(null);
            mutateIndexers?.();
        } catch (err: any) {
            toast.error(err?.message ?? "Failed to update indexer");
        } finally {
            setSavingIndexer(false);
        }
    }, [editIndexer, indexerForm, savingIndexer, toast, mutateIndexers]);

    const enableAllIndexers = useCallback(async () => {
        if (!indexerData?.indexers?.length || bulkIndexerSaving) return;
        setBulkIndexerSaving(true);
        try {
            const results = await Promise.allSettled(indexerData.indexers.map(async (indexer) => {
                const res = await csrfFetch("/api/v1/admin/prowlarr/indexers", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: indexer.id, enable: true })
                });
                if (!res.ok) throw new Error(`Failed to update ${indexer.name ?? "indexer"}`);
                return true;
            }));
            const failures = results.filter(result => result.status === "rejected");
            if (failures.length) {
                toast.error(`Enabled with ${failures.length} failure(s)`);
            } else {
                toast.success("All indexers enabled");
            }
            mutateIndexers?.();
        } catch (err: any) {
            toast.error(err?.message ?? "Failed to enable indexers");
        } finally {
            setBulkIndexerSaving(false);
        }
    }, [indexerData, bulkIndexerSaving, toast, mutateIndexers]);

    useEffect(() => {
        services.forEach(s => { if (!statusMap[s.id]) pingService(s); });
    }, [services, statusMap, pingService]);

    const radarrServices = services.filter(s => s.type === "radarr");
    const sonarrServices = services.filter(s => s.type === "sonarr");
    const prowlarrServices = services.filter(s => s.type === "prowlarr");
    const downloaderServices = services.filter(s => ["sabnzbd", "qbittorrent", "nzbget"].includes(s.type));

    const mediaDetails: ServiceHealthDetail[] = useMemo(() => {
        if (healthData?.serviceDetails?.length) return healthData.serviceDetails;
        return services.map((svc: any) => ({
            id: svc.id,
            name: svc.name,
            type: svc.type,
            healthy: healthData?.services?.[`${svc.type}:${svc.id}`] ?? false,
            enabled: svc.enabled,
            statusText: svc.enabled ? undefined : "Disabled",
            queueSize: 0,
            failedCount: 0
        }));
    }, [healthData?.serviceDetails, healthData?.services, services]);

    const renderServiceCard = (service: MediaService) => {
        const cfg = (service.config as any) || {};
        const logo = logoMap[service.type];
        const status = statusMap[service.id]?.state ?? "idle";
        const gradient = serviceGradients[service.type];

        return (
            <div key={service.id} className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-4 transition-all hover:bg-white/[0.07] hover:border-white/10 hover:shadow-lg hover:shadow-black/20">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient.from} ${gradient.to} p-3 ring-1 ring-inset ring-white/10 shadow-inner`}>
                            <Image src={logo} alt={service.type} className="h-full w-full object-contain drop-shadow-sm" />
                            {status === "checking" && (
                                <div className="absolute inset-0 rounded-2xl bg-white/20 animate-pulse" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-white tracking-tight">{service.name}</h3>
                                {cfg.defaultServer && (
                                    <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                                        DEFAULT
                                    </span>
                                )}
                                {cfg.fourKServer && (
                                    <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 ring-1 ring-inset ring-amber-500/20">
                                        4K
                                    </span>
                                )}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                                <span className={`h-1.5 w-1.5 rounded-full ${status === 'ok' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : status === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : status === 'checking' ? 'bg-amber-500 animate-pulse' : 'bg-gray-600'}`} />
                                <span className="truncate font-mono opacity-80">{service.base_url}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/5 pt-3">
                    <button
                        onClick={() => pingService(service)}
                        className="group/btn flex h-8 items-center gap-2 rounded-lg bg-white/5 px-3 text-xs font-medium text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                        title="Test Connection"
                    >
                        <RefreshCcw className={`h-3.5 w-3.5 transition-transform ${status === "checking" ? "animate-spin" : "group-hover/btn:rotate-180"}`} />
                        <span className="hidden sm:inline">Test</span>
                    </button>
                    <div className="h-4 w-px bg-white/10" />
                    <button
                        onClick={() => openEdit(service)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-colors hover:bg-blue-500/20 hover:text-blue-400"
                        title="Edit Configuration"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                        </svg>
                    </button>
                    <button
                        onClick={async () => {
                            if (!confirm("Delete this service? This action cannot be undone.")) return;
                            await csrfFetch(`/api/v1/admin/services/${service.id}`, { method: "DELETE", credentials: "include" });
                            mutate();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
                        title="Delete Service"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    };

    const renderServiceSection = (
        title: string,
        type: MediaService["type"],
        serviceList: MediaService[],
        icon: any,
        gradient: { from: string; to: string; text: string }
    ) => (
        <div className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl transition-all hover:bg-black/30">
            <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient.from} ${gradient.to} p-2 shadow-lg ring-1 ring-inset ring-white/10`}>
                        <Image src={icon} alt={title} className="h-full w-full object-contain drop-shadow" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
                        <p className="text-xs font-medium text-gray-400">{serviceDescriptions[type]}</p>
                    </div>
                </div>
                <button
                    onClick={() => openCreate(type)}
                    className={`group relative overflow-hidden rounded-lg bg-gradient-to-br ${gradient.from} ${gradient.to} px-3 py-1.5 font-bold text-white shadow-lg ring-1 ring-inset ring-white/10 transition-all hover:scale-105 active:scale-95`}
                >
                    <span className="relative z-10 flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                        </svg>
                        Add
                    </span>
                    <div className="absolute inset-0 z-0 bg-white/0 transition-colors group-hover:bg-white/10" />
                </button>
            </div>
            
            <div className="flex-1 bg-gradient-to-b from-transparent to-black/20 p-4">
                {serviceList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.01] py-8 text-center transition-colors hover:bg-white/[0.02]">
                        <p className="text-xs font-medium text-gray-400">No servers</p>
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                        {serviceList.map(renderServiceCard)}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Status & Integrations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Trakt Status Card */}
                <div className={`rounded-2xl border bg-gradient-to-br p-4 space-y-3 ${traktAuthorized ? "from-emerald-500/10 to-teal-500/5 border-emerald-500/20" : "from-gray-800/50 to-gray-900/50 border-white/10"}`}>
                   <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                           <div className={`p-1.5 rounded-lg ${traktAuthorized ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-gray-400"}`}>
                               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                   <path fillRule="evenodd" d="M4.5 3.75a3 3 0 00-3 3v10.5a3 3 0 003 3h15a3 3 0 003-3V6.75a3 3 0 00-3-3h-15zm4.125 3a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5zm-3.873 8.703a4.126 4.126 0 017.746 0 .75.75 0 01-.351.92 7.47 7.47 0 01-3.522.877 7.47 7.47 0 01-3.522-.877.75.75 0 01-.351-.92zM15 8.25a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H15.75a.75.75 0 01-.75-.75zM15 12a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H15.75a.75.75 0 01-.75-.75zM15 15.75a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H15.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                               </svg>
                           </div>
                           <span className="text-sm font-semibold text-white">Trakt</span>
                       </div>
                       {traktAuthorized ? (
                           <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                       ) : (
                           <button 
                               onClick={() => document.getElementById('trakt-settings')?.scrollIntoView({ behavior: 'smooth' })}
                               className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded text-white transition-colors"
                           >
                               Setup
                           </button>
                       )}
                   </div>
                   <div className="text-xs text-white/40">
                       {traktAuthorized ? "Account connected & syncing" : "Not connected"}
                   </div>
                </div>

                {/* 2. System Health Card */}
                <div className={`rounded-2xl border bg-gradient-to-br p-4 space-y-3 ${healthData?.database && healthData?.tmdb ? "from-emerald-500/10 to-teal-500/5 border-emerald-500/20" : "from-red-500/10 to-orange-500/5 border-red-500/20"}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <div className={`p-1.5 rounded-lg ${healthData?.database ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                               <Database className="w-4 h-4" />
                           </div>
                           <span className="text-sm font-semibold text-white">System</span>
                        </div>
                         <span className={`text-xs font-bold ${healthData?.database && healthData?.tmdb ? "text-emerald-400" : "text-red-400"}`}>
                            {healthData?.database && healthData?.tmdb ? "Healthy" : "Issues"}
                        </span>
                    </div>
                     <div className="flex gap-2 text-[10px] text-white/40">
                        <span className={healthData?.database ? "text-emerald-400" : "text-red-400"}>DB</span> • 
                        <span className={healthData?.tmdb ? "text-emerald-400" : "text-red-400"}>TMDB</span> • 
                        <span className={healthData?.jellyfin ? "text-emerald-400" : "text-red-400"}>Jellyfin</span>
                    </div>
                </div>

                {/* 3. Media Services Status */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                               <Server className="w-4 h-4" />
                           </div>
                           <span className="text-sm font-semibold text-white">Services</span>
                        </div>
                        <span className="text-xs text-white/40">{services.length} Total</span>
                    </div>
                     <div className="text-xs text-white/40">
                        {mediaDetails.filter(s => s.healthy).length} Online • {mediaDetails.filter(s => !s.healthy).length} Offline
                    </div>
                </div>

                {/* 4. Download Clients Status */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                               <Download className="w-4 h-4" />
                           </div>
                           <span className="text-sm font-semibold text-white">Downloaders</span>
                        </div>
                        <span className="text-xs text-white/40">{downloaderServices.length} Active</span>
                    </div>
                    <div className="text-xs text-white/40">
                         {downloaderServices.map(s => s.type).join(", ") || "None configured"}
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                {renderServiceSection("Radarr", "radarr", radarrServices, RadarrLogo, serviceGradients.radarr)}
                {renderServiceSection("Sonarr", "sonarr", sonarrServices, SonarrLogo, serviceGradients.sonarr)}
            </div>

            {/* Secondary Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Prowlarr Section */}
                <div className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl transition-all hover:bg-black/30">
                    <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-6 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 p-2 shadow-lg ring-1 ring-inset ring-white/10">
                                <Image src={ProwlarrLogo} alt="Prowlarr" className="h-full w-full object-contain drop-shadow" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white tracking-tight">Prowlarr</h3>
                                <p className="text-xs font-medium text-gray-400">Indexer Manager</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => openCreate("prowlarr")}
                                className="group/btn relative overflow-hidden rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1.5 font-bold shadow-lg transition-all hover:bg-purple-500/30 active:scale-95"
                            >
                                <span className="text-[10px] uppercase tracking-wider flex items-center gap-1">Add Server</span>
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 p-4">
                         {prowlarrServices.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.01] py-8 text-center">
                                <p className="text-xs font-medium text-gray-400">No Prowlarr servers</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-1">
                                    {prowlarrServices.map(renderServiceCard)}
                                </div>
                                <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                                     <button
                                        onClick={() => setShowIndexers(!showIndexers)}
                                        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-white uppercase tracking-wider">Indexers</span>
                                            {indexerData?.indexers && (
                                                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px]">
                                                    {indexerData.indexers.filter(i => i.enable).length} Active
                                                </span>
                                            )}
                                        </div>
                                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 text-gray-400 transition-transform ${showIndexers ? "rotate-180" : ""}`}>
                                            <path fillRule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    {showIndexers && (
                                        <div className="border-t border-white/5 max-h-48 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                            {indexerData?.indexers?.map((indexer) => (
                                                <div key={indexer.id} className="flex items-center justify-between p-2 rounded hover:bg-white/5">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`h-1.5 w-1.5 rounded-full ${indexer.enable ? "bg-emerald-500" : "bg-gray-600"}`} />
                                                        <span className="text-xs text-white truncate max-w-[150px]">{indexer.name}</span>
                                                    </div>
                                                    <button onClick={() => { setEditIndexer(indexer); setIndexerForm({ enable: Boolean(indexer.enable), priority: indexer.priority ?? 1 }); }} className="text-[10px] text-gray-400 hover:text-white">
                                                        Edit
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Download Clients Section */}
                <div className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl transition-all hover:bg-black/30">
                    <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-6 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 p-2 shadow-lg ring-1 ring-inset ring-white/10">
                                <Download className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white tracking-tight">Downloaders</h3>
                                <p className="text-xs font-medium text-gray-400">Clients</p>
                            </div>
                        </div>
                         <div className="flex gap-1">
                             {(['sabnzbd', 'qbittorrent', 'nzbget'] as const).map(id => (
                                <button
                                    key={id}
                                    onClick={() => openCreate(id as any)}
                                    className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-white/40 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                                    title={`Add ${id}`}
                                >
                                    <span className="sr-only">Add {id}</span>
                                    {logoMap[id] ? <Image src={logoMap[id]} alt={id} className="w-4 h-4 object-contain opacity-70 hover:opacity-100" /> : <div className="w-4 h-4 bg-gray-500 rounded" />}
                                </button>
                             ))}
                        </div>
                    </div>
                    <div className="flex-1 p-4">
                        {downloaderServices.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.01] py-8 text-center">
                                <p className="text-xs font-medium text-gray-400">No download clients</p>
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                                {downloaderServices.map(renderServiceCard)}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Manual Trakt Settings (Hidden unless not connected or explictly shown, but kept in DOM for functionality) */}
            <div id="trakt-settings" className="rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl overflow-hidden">
                <button 
                    onClick={() => setExpandedSection(expandedSection === "trakt" ? "" : "trakt")}
                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-white uppercase tracking-wider px-2">Trakt Integration Settings</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === "trakt" ? "rotate-180" : ""}`}>
                        <path fillRule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clipRule="evenodd" />
                    </svg>
                </button>
                {expandedSection === "trakt" && (
                    <div className="p-6 border-t border-white/10 bg-black/10">
                         <form onSubmit={handleSaveTrakt} className="space-y-4 max-w-2xl">
                            <label className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3 transition-colors hover:bg-white/10 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={traktConfig.enabled}
                                    onChange={(e) => setTraktConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                                />
                                <span className="text-sm font-medium text-white">Enable Trakt Integration</span>
                            </label>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Client ID</label>
                                    <input
                                        className="input w-full bg-black/20"
                                        value={traktConfig.clientId}
                                        onChange={e => setTraktConfig(prev => ({ ...prev, clientId: e.target.value }))}
                                        placeholder="Trakt Client ID"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Client Secret</label>
                                    <input
                                        className="input w-full bg-black/20"
                                        type="password"
                                        value={traktConfig.clientSecret}
                                        onChange={e => setTraktConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                                        placeholder="Trakt Client Secret"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Redirect URI</label>
                                <input
                                    className="input w-full bg-black/20"
                                    value={traktConfig.redirectUri}
                                    onChange={e => setTraktConfig(prev => ({ ...prev, redirectUri: e.target.value }))}
                                    placeholder="Optional: Default URI"
                                />
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button 
                                    className="btn-primary flex items-center gap-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30" 
                                    type="submit" 
                                    disabled={traktSaving}
                                >
                                    {traktSaving ? "Saving..." : "Save Settings"}
                                </button>
                                {canStartTraktOAuth && !traktConfig.appAuthorizedAt && (
                                     <div className="text-xs text-amber-400 flex items-center gap-1">
                                         <Server className="w-3 h-3" /> Save to enable OAuth
                                     </div>
                                )}
                            </div>
                        </form>
                    </div>
                )}
            </div>

            {/* Service Modal */}
            <Modal open={!!modal} title={modalTitle} onClose={handleClose}>
                <form className="space-y-5 max-h-[75vh] overflow-y-auto pr-2" onSubmit={handleSubmit}>
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Name</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" required placeholder="Main Server" />
                            </div>
                            {isDownloader && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Type</label>
                                    <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value as FormState["type"] })}>
                                        <SelectTrigger className="input"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="sabnzbd">SABnzbd</SelectItem>
                                            <SelectItem value="qbittorrent">qBittorrent</SelectItem>
                                            <SelectItem value="nzbget">NZBGet</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Connection */}
                    <div className="space-y-4 pt-4 border-t border-white/10">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Connection</h4>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Hostname / IP</label>
                                <input value={form.hostname} onChange={e => setForm({ ...form, hostname: e.target.value })} className="input" required placeholder="192.168.1.10" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Port</label>
                                    <input value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} className="input" placeholder={portPlaceholderMap[form.type]} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">URL Base</label>
                                    <input value={form.urlBase} onChange={e => setForm({ ...form, urlBase: e.target.value })} className="input" placeholder={urlBasePlaceholderMap[form.type]} />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={form.useSsl} onChange={e => setForm({ ...form, useSsl: e.target.checked })} className="rounded bg-white/5 border-white/20" />
                                <span className="text-sm text-gray-300">Use SSL</span>
                            </label>
                        </div>
                    </div>

                    {/* Authentication */}
                    <div className="space-y-4 pt-4 border-t border-white/10">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Authentication</h4>
                        {needsUsername && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Username</label>
                                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="input" placeholder="admin" />
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-white">{apiKeyLabel}</label>
                            <input type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} className="input" placeholder={modal?.mode === "edit" ? "Leave blank to keep current" : "Paste from service settings"} required={modal?.mode === "create"} />
                        </div>
                    </div>

                    {/* Radarr Config */}
                    {form.type === "radarr" && (
                        <div className="space-y-4 pt-4 border-t border-white/10">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Radarr Settings</h4>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Quality Profile ID</label>
                                    <input value={form.qualityProfileId} onChange={e => setForm({ ...form, qualityProfileId: e.target.value })} className="input" placeholder="1" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Root Folder</label>
                                    <input value={form.rootFolder} onChange={e => setForm({ ...form, rootFolder: e.target.value })} className="input" placeholder="/movies" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Tags (comma separated)</label>
                                <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="input" placeholder="lemedia" />
                            </div>
                        </div>
                    )}

                    {/* Sonarr Config */}
                    {form.type === "sonarr" && (
                        <div className="space-y-4 pt-4 border-t border-white/10">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Sonarr Settings</h4>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Series Type</label>
                                    <input value={form.seriesType} onChange={e => setForm({ ...form, seriesType: e.target.value })} className="input" placeholder="standard" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Quality Profile ID</label>
                                    <input value={form.qualityProfileId} onChange={e => setForm({ ...form, qualityProfileId: e.target.value })} className="input" placeholder="1" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Default Monitoring</label>
                                <AdaptiveSelect
                                    value={form.monitoringOption}
                                    onValueChange={(value) => setForm({ ...form, monitoringOption: value })}
                                    options={monitoringOptions}
                                    placeholder="Select monitoring option"
                                    className="w-full"
                                />
                                <p className="text-xs text-gray-400">
                                    Applied when adding new series via requests.
                                </p>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Root Folder</label>
                                    <input value={form.rootFolder} onChange={e => setForm({ ...form, rootFolder: e.target.value })} className="input" placeholder="/tv" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Tags</label>
                                    <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="input" placeholder="lemedia" />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={form.seasonFolders} onChange={e => setForm({ ...form, seasonFolders: e.target.checked })} className="rounded bg-white/5 border-white/20" />
                                <span className="text-sm text-gray-300">Use Season Folders</span>
                            </label>
                        </div>
                    )}

                    {/* Options */}
                    <div className="flex flex-wrap gap-4 pt-4 border-t border-white/10">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} className="rounded bg-white/5 border-white/20" />
                            <span className="text-sm text-gray-300">Enabled</span>
                        </label>
                        {!isDownloader && (
                            <>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={form.defaultServer} onChange={e => setForm({ ...form, defaultServer: e.target.checked })} className="rounded bg-white/5 border-white/20" />
                                    <span className="text-sm text-gray-300">Default Server</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={form.fourKServer} onChange={e => setForm({ ...form, fourKServer: e.target.checked })} className="rounded bg-white/5 border-white/20" />
                                    <span className="text-sm text-gray-300">4K Server</span>
                                </label>
                            </>
                        )}
                    </div>

                    {/* Test Connection */}
                    <div className="pt-4 border-t border-white/10">
                        <button type="button" onClick={runTest} disabled={testing} className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-white hover:bg-white/10 transition-all disabled:opacity-50">
                            {testing ? "Testing..." : "Test Connection"}
                        </button>
                        {testMessage && (
                            <p className={`mt-2 text-center text-sm font-medium ${testMessage.includes('succeeded') ? 'text-emerald-400' : 'text-red-400'}`}>
                                {testMessage}
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                        <button type="button" onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white">Cancel</button>
                        <button type="submit" disabled={submitting} className="px-6 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 disabled:opacity-50">
                            {submitting ? "Saving..." : modal?.mode === "edit" ? "Save Changes" : "Add Service"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Indexer Edit Modal */}
            <Modal open={!!editIndexer} title={`Edit Indexer: ${editIndexer?.name ?? ""}`} onClose={() => setEditIndexer(null)}>
                <form className="space-y-4" onSubmit={saveIndexer}>
                    <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10">
                        <input type="checkbox" checked={indexerForm.enable} onChange={e => setIndexerForm(prev => ({ ...prev, enable: e.target.checked }))} className="rounded bg-white/5 border-white/20" />
                        <span className="text-sm font-medium text-white">Enable Indexer</span>
                    </label>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Priority</label>
                        <input type="number" min={0} value={indexerForm.priority} onChange={e => setIndexerForm(prev => ({ ...prev, priority: Number(e.target.value) }))} className="input" />
                        <p className="text-xs text-gray-500">Lower priority is preferred (1 = highest priority)</p>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                        <button type="button" onClick={() => setEditIndexer(null)} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white">Cancel</button>
                        <button type="submit" disabled={savingIndexer} className="px-6 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-purple-500/20 disabled:opacity-50">
                            {savingIndexer ? "Saving..." : "Save"}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
