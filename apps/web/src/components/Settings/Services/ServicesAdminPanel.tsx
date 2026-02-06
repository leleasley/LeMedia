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
import { Loader2, CheckCircle2, XCircle, Database, Film, Tv, RefreshCcw } from "lucide-react";

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
            <div key={service.id} className="group relative rounded-xl border border-white/10 bg-white/5 overflow-hidden hover:bg-white/[0.07] transition-all">
                <div className="p-4">
                    <div className="flex items-start gap-3">
                        <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${gradient.from} ${gradient.to} p-2.5 flex items-center justify-center shrink-0 ring-1 ring-white/10`}>
                            <Image src={logo} alt={service.type} className="h-full w-full object-contain" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-white">{service.name}</span>
                                {cfg.defaultServer && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">DEFAULT</span>
                                )}
                                {cfg.fourKServer && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">4K</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <div className={`h-2 w-2 rounded-full ${status === 'ok' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : status === 'checking' ? 'bg-amber-500 animate-pulse' : 'bg-gray-500'}`} />
                                <span className="text-xs text-gray-500 truncate">{service.base_url}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-white/5 bg-white/[0.02]">
                    <button onClick={() => pingService(service)} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors" title="Test Connection">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
                    </button>
                    <button onClick={() => openEdit(service)} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors" title="Edit">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button
                        onClick={async () => {
                            if (!confirm("Delete this service?")) return;
                            await csrfFetch(`/api/v1/admin/services/${service.id}`, { method: "DELETE", credentials: "include" });
                            mutate();
                        }}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                        title="Delete"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
        <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${gradient.from} ${gradient.to} p-2 flex items-center justify-center ring-1 ring-white/10`}>
                        <Image src={icon} alt={title} className="h-full w-full object-contain" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">{title}</h3>
                        <p className="text-xs text-gray-500">{serviceDescriptions[type]}</p>
                    </div>
                </div>
                <button
                    onClick={() => openCreate(type)}
                    className={`px-3 py-1.5 rounded-lg bg-gradient-to-r ${gradient.from} ${gradient.to} ${gradient.text} text-xs font-bold border border-white/10 hover:border-white/20 transition-all`}
                >
                    Add Server
                </button>
            </div>
            <div className="p-4">
                {serviceList.length === 0 ? (
                    <div className="py-8 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
                        <p className="text-sm text-gray-500">No servers configured</p>
                        <button onClick={() => openCreate(type)} className="mt-2 text-xs text-purple-400 hover:text-purple-300">
                            Add your first {title} server
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {serviceList.map(renderServiceCard)}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted">Integrations</p>
                        <h2 className="text-lg font-semibold text-white">Trakt OAuth</h2>
                        <p className="text-sm text-muted">Connect Trakt to enable watchlist sync and profile linking.</p>
                    </div>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                    {traktAuthorized ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                        <XCircle className="h-4 w-4 text-amber-400" />
                    )}
                    <div className="text-gray-300">
                        <span className="font-semibold text-white">
                            {traktAuthorized ? "Connected" : "Not connected"}
                        </span>
                        {traktAuthorized && traktConfig.appAuthorizedAt ? (
                            <span className="ml-2 text-xs text-gray-400">
                                Approved {new Date(traktConfig.appAuthorizedAt).toLocaleString()}
                            </span>
                        ) : (
                            <span className="ml-2 text-xs text-gray-400">
                                {traktConfigured ? "Approve OAuth to finish setup" : "Save credentials first"}
                            </span>
                        )}
                    </div>
                </div>
                <form onSubmit={handleSaveTrakt} className="mt-4 space-y-4">
                    <label className="flex items-center gap-3 text-sm text-white">
                        <input
                            type="checkbox"
                            checked={traktConfig.enabled}
                            onChange={(e) => setTraktConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                            className="h-4 w-4 rounded border-white/20 bg-white/10"
                        />
                        Enable Trakt integration
                    </label>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1 text-sm">
                            <label className="font-semibold text-white">Client ID</label>
                            <input
                                className="w-full input"
                                value={traktConfig.clientId}
                                onChange={e => setTraktConfig(prev => ({ ...prev, clientId: e.target.value }))}
                                placeholder="Paste your Trakt client ID"
                            />
                        </div>
                        <div className="space-y-1 text-sm">
                            <label className="font-semibold text-white">Client Secret</label>
                            <input
                                className="w-full input"
                                type="password"
                                value={traktConfig.clientSecret}
                                onChange={e => setTraktConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                                placeholder="Leave blank to keep current"
                            />
                        </div>
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Redirect URI</label>
                        <input
                            className="w-full input"
                            value={traktConfig.redirectUri}
                            onChange={e => setTraktConfig(prev => ({ ...prev, redirectUri: e.target.value }))}
                            placeholder="Leave blank to use the default app URL"
                        />
                        <p className="text-xs text-muted">If empty, LeMedia will use `/api/v1/profile/trakt/callback` on the app base URL.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <button className="btn" type="submit" disabled={traktSaving}>
                            {traktSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save Trakt Settings"
                            )}
                        </button>
                    </div>
                </form>
            </div>
            <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted">Integrations</p>
                        <h2 className="text-lg font-semibold text-white">IMDb</h2>
                        <p className="text-sm text-muted">
                            We cannot build IMDB due to a proxy needed which there is no point.
                        </p>
                    </div>
                </div>
            </div>
            {/* System Status Card */}
            <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden">
                <button
                    onClick={() => setExpandedSection(expandedSection === "status" ? "" : "status")}
                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center ring-1 ring-white/10">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div className="text-left">
                            <h3 className="font-semibold text-white">System Status</h3>
                            <p className="text-xs text-gray-500">
                                {healthData?.database && healthData?.tmdb ? "All systems operational" : "Some issues detected"}
                            </p>
                        </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === "status" ? "rotate-180" : ""}`}>
                        <path fillRule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clipRule="evenodd" />
                    </svg>
                </button>

                {expandedSection === "status" && (
                    <div className="border-t border-white/10 p-4 space-y-4">
                        {/* Core Services */}
                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                { label: "Database", healthy: healthData?.database ?? false, icon: Database },
                                { label: "TMDB API", healthy: healthData?.tmdb ?? false, icon: Film },
                                { label: "Jellyfin", healthy: healthData?.jellyfin ?? false, icon: Tv }
                            ].map(item => (
                                <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className={`p-2 rounded-lg ${item.healthy ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                                        <item.icon className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-white">{item.label}</p>
                                        <p className={`text-xs ${item.healthy ? "text-emerald-400" : "text-red-400"}`}>
                                            {item.healthy ? "Operational" : "Issue"}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Service Details */}
                        {mediaDetails.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-400">Media Services</h4>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {mediaDetails.map(detail => (
                                        <div key={detail.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`h-2 w-2 rounded-full ${detail.healthy ? "bg-emerald-500" : "bg-red-500"}`} />
                                                    <span className="text-sm font-medium text-white">{detail.name}</span>
                                                    <span className="text-xs text-gray-500">({detail.type})</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 text-xs">
                                                <span className="px-2 py-1 rounded-full bg-white/10 text-gray-300">Queue: {detail.queueSize}</span>
                                                <span className={`px-2 py-1 rounded-full ${detail.failedCount > 0 ? "bg-red-500/20 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                                                    Failed: {detail.failedCount}
                                                </span>
                                                {detail.type === "prowlarr" && (
                                                    <span className="px-2 py-1 rounded-full bg-white/10 text-gray-300">
                                                        Indexers: {indexerData?.indexers?.filter(i => i.enable).length ?? "—"}
                                                    </span>
                                                )}
                                                {detail.disk?.freeBytes && (
                                                    <span className="px-2 py-1 rounded-full bg-white/10 text-gray-300">
                                                        Free: {formatBytes(detail.disk.freeBytes)}
                                                    </span>
                                                )}
                                            </div>
                                            {(detail.type === "radarr" || detail.type === "sonarr") && detail.failedCount > 0 && (
                                                <button
                                                    onClick={() => handleRetry(detail)}
                                                    disabled={!detail.enabled || retryingId === detail.id}
                                                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
                                                >
                                                    {retryingId === detail.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                                                    Retry Failed
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Service Sections */}
            <div className="grid gap-6 lg:grid-cols-2">
                {renderServiceSection("Radarr", "radarr", radarrServices, RadarrLogo, serviceGradients.radarr)}
                {renderServiceSection("Sonarr", "sonarr", sonarrServices, SonarrLogo, serviceGradients.sonarr)}
            </div>

            {/* Prowlarr with Indexers */}
            <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${serviceGradients.prowlarr.from} ${serviceGradients.prowlarr.to} p-2 flex items-center justify-center ring-1 ring-white/10`}>
                            <Image src={ProwlarrLogo} alt="Prowlarr" className="h-full w-full object-contain" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Prowlarr</h3>
                            <p className="text-xs text-gray-500">{serviceDescriptions.prowlarr}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => openCreate("prowlarr")}
                        className={`px-3 py-1.5 rounded-lg bg-gradient-to-r ${serviceGradients.prowlarr.from} ${serviceGradients.prowlarr.to} ${serviceGradients.prowlarr.text} text-xs font-bold border border-white/10 hover:border-white/20 transition-all`}
                    >
                        Add Server
                    </button>
                </div>
                <div className="p-4">
                    {prowlarrServices.length === 0 ? (
                        <div className="py-8 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
                            <p className="text-sm text-gray-500">No Prowlarr servers configured</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                {prowlarrServices.map(renderServiceCard)}
                            </div>

                            {/* Indexers Section */}
                            <div className="border-t border-white/10 pt-4">
                                <button
                                    onClick={() => setShowIndexers(!showIndexers)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-white">Indexers</span>
                                        {indexerData?.indexers && (
                                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs">
                                                {indexerData.indexers.filter(i => i.enable).length} / {indexerData.indexers.length} enabled
                                            </span>
                                        )}
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 text-gray-400 transition-transform ${showIndexers ? "rotate-180" : ""}`}>
                                        <path fillRule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clipRule="evenodd" />
                                    </svg>
                                </button>

                                {showIndexers && (
                                    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                                        {indexerError ? (
                                            <div className="p-6 text-center text-sm text-gray-500">Failed to load indexers</div>
                                        ) : !indexerData?.indexers?.length ? (
                                            <div className="p-6 text-center text-sm text-gray-500">No indexers found in Prowlarr</div>
                                        ) : (
                                            <>
                                                <div className="flex justify-end p-3 border-b border-white/10">
                                                    <button
                                                        onClick={enableAllIndexers}
                                                        disabled={bulkIndexerSaving}
                                                        className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-xs font-bold hover:bg-purple-500/30 disabled:opacity-50"
                                                    >
                                                        {bulkIndexerSaving ? "Enabling..." : "Enable All"}
                                                    </button>
                                                </div>
                                                <div className="max-h-64 overflow-y-auto">
                                                    {indexerData.indexers.map((indexer) => (
                                                        <div key={indexer.id} className="flex items-center justify-between p-3 border-b border-white/5 last:border-0 hover:bg-white/5">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`h-2 w-2 rounded-full ${indexer.enable ? "bg-emerald-500" : "bg-gray-500"}`} />
                                                                <div>
                                                                    <p className="text-sm font-medium text-white">{indexer.name}</p>
                                                                    <p className="text-xs text-gray-500">{indexer.implementationName ?? indexer.protocol}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    setEditIndexer(indexer);
                                                                    setIndexerForm({ enable: Boolean(indexer.enable), priority: indexer.priority ?? 1 });
                                                                }}
                                                                className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-white hover:bg-white/10"
                                                            >
                                                                Edit
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Downloaders */}
            <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-2 flex items-center justify-center ring-1 ring-white/10">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-cyan-400">
                                <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Download Clients</h3>
                            <p className="text-xs text-gray-500">Configure Usenet and BitTorrent clients</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => openCreate("sabnzbd")} className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-300 text-xs font-bold border border-white/10 hover:border-white/20">SABnzbd</button>
                        <button onClick={() => openCreate("qbittorrent")} className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 text-xs font-bold border border-white/10 hover:border-white/20">qBittorrent</button>
                        <button onClick={() => openCreate("nzbget")} className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 text-xs font-bold border border-white/10 hover:border-white/20">NZBGet</button>
                    </div>
                </div>
                <div className="p-4">
                    {downloaderServices.length === 0 ? (
                        <div className="py-8 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
                            <p className="text-sm text-gray-500">No download clients configured</p>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {downloaderServices.map(renderServiceCard)}
                        </div>
                    )}
                </div>
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
