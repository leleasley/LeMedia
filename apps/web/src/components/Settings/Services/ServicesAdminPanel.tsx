"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/Common/Modal";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import useSWR from "swr";
import RadarrLogo from "@/assets/services/radarr.svg";
import SonarrLogo from "@/assets/services/sonarr.svg";
import { ServiceHealthWidget } from "./ServiceHealthWidget";

type MediaService = {
    id: number;
    name: string;
    type: "radarr" | "sonarr";
    base_url: string;
    config: Record<string, unknown>;
    enabled: boolean;
    created_at: string;
    updated_at: string;
};

type ModalState = { mode: "create" } | { mode: "edit"; service: MediaService };

type FormState = {
    name: string;
    type: MediaService["type"];
    apiKey: string;
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
};

const initialForm: FormState = {
    name: "",
    type: "radarr",
    apiKey: "",
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
    seasonFolders: true
};

const cloneInitialForm = (): FormState => ({ ...initialForm });

const toStringValue = (value?: unknown) => (value == null ? "" : String(value));

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then(res => res.json());

export function ServicesAdminPanel({ initialServices }: { initialServices: MediaService[] }) {
    const toast = useToast();
    const { data, mutate, isLoading } = useSWR<{ services: MediaService[] }>("/api/v1/admin/services", fetcher, {
        fallbackData: { services: initialServices },
        revalidateOnFocus: false
    });

    const services = useMemo(() => data?.services ?? [], [data]);
    
    const [modal, setModal] = useState<ModalState | null>(null);
    const [form, setForm] = useState<FormState>(cloneInitialForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [testMessage, setTestMessage] = useState<string | null>(null);
    const [statusMap, setStatusMap] = useState<Record<number, { state: "idle" | "checking" | "ok" | "error"; message?: string }>>({});

    const buildBaseUrl = useCallback((f: FormState) => {
        const trimmedHost = f.hostname.trim();
        if (!trimmedHost) return "";
        const trimmedPort = f.port.trim();
        const normalizedPath = f.urlBase.trim();
        const path = normalizedPath ? (normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`) : "";
        return `${f.useSsl ? "https" : "http"}://${trimmedHost}${trimmedPort ? `:${trimmedPort}` : ""}${path}`;
    }, []);

    const computedBaseUrl = buildBaseUrl(form);
    const typeLabel = form.type === "radarr" ? "Radarr" : "Sonarr";
    const modalTitle = modal?.mode === "edit" ? `Edit ${typeLabel} server` : `Add ${typeLabel} server`;

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
            seasonFolders: Boolean(cfg.seasonFolders ?? true)
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
            seasonFolders: form.seasonFolders
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
            mutate();
            handleClose();
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
        // If edit mode and no key, allow it (backend will use stored key)
        if (!apiKeyToUse && (!modal || modal.mode !== 'edit')) {
             setTestMessage("API key required.");
             return;
        }

        setTesting(true);
        try {
            const payload: any = { type: form.type, baseUrl: computedBaseUrl, apiKey: apiKeyToUse };
            if (modal?.mode === 'edit') {
                payload.id = modal.service.id;
            }

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
    }, [computedBaseUrl, form.apiKey, form.type, modal]);

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

    useEffect(() => {
        services.forEach(s => { if (!statusMap[s.id]) pingService(s); });
    }, [services, statusMap, pingService]);

    const radarrServices = services.filter(s => s.type === "radarr");
    const sonarrServices = services.filter(s => s.type === "sonarr");

    const renderServiceCard = (service: MediaService) => {
        const cfg = (service.config as any) || {};
        const logo = service.type === "radarr" ? RadarrLogo : SonarrLogo;
        const status = statusMap[service.id]?.state ?? "idle";

        return (
            <div key={service.id} className="group relative flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-white/10 bg-slate-900/40 p-3 hover:bg-slate-900/60 transition-all shadow-sm">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-white/5 p-2 flex items-center justify-center shrink-0 border border-white/5 group-hover:border-white/10 transition-colors">
                        <Image src={logo} alt={service.type} className="h-full w-full object-contain opacity-80 group-hover:opacity-100 transition-opacity" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white truncate">{service.name}</span>
                            {cfg.defaultServer && <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-tight">Default</span>}
                            {cfg.fourKServer && <span className="text-[10px] text-amber-400 font-bold uppercase tracking-tight">4K</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <div className={`h-1.5 w-1.5 rounded-full ${status === 'ok' ? 'bg-emerald-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-gray-500'}`} />
                            <span className="text-[10px] text-muted truncate opacity-70">{service.base_url}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => pingService(service)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors" title="Ping">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
                    </button>
                    <button onClick={() => openEdit(service)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors" title="Edit">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button 
                        onClick={async () => {
                            if (!confirm("Delete service?")) return;
                            await csrfFetch(`/api/v1/admin/services/${service.id}`, { method: "DELETE", credentials: "include" });
                            mutate();
                        }} 
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors" 
                        title="Delete"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <ServiceHealthWidget services={services} />
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Radarr Section */}
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 shadow-lg shadow-black/10">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Image src={RadarrLogo} alt="Radarr" className="h-5 w-5" />
                        <h3 className="text-lg font-bold text-white">Radarr</h3>
                    </div>
                    <button onClick={() => openCreate("radarr")} className="px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 text-xs font-bold hover:bg-indigo-600/30 transition-colors">
                        Add Server
                    </button>
                </div>
                <div className="space-y-2">
                    {radarrServices.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted opacity-50 border border-dashed border-white/5 rounded-xl italic">No servers configured</div>
                    ) : (
                        radarrServices.map(renderServiceCard)
                    )}
                </div>
            </div>

            {/* Sonarr Section */}
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 shadow-lg shadow-black/10">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Image src={SonarrLogo} alt="Sonarr" className="h-5 w-5" />
                        <h3 className="text-lg font-bold text-white">Sonarr</h3>
                    </div>
                    <button onClick={() => openCreate("sonarr")} className="px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 text-xs font-bold hover:bg-indigo-600/30 transition-colors">
                        Add Server
                    </button>
                </div>
                <div className="space-y-2">
                    {sonarrServices.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted opacity-50 border border-dashed border-white/5 rounded-xl italic">No servers configured</div>
                    ) : (
                        sonarrServices.map(renderServiceCard)
                    )}
                </div>
            </div>

            <Modal open={!!modal} title={modalTitle} onClose={handleClose}>
                <form className="space-y-4 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar" onSubmit={handleSubmit}>
                    <div className="grid gap-4 md:grid-cols-2 text-sm">
                        <div className="space-y-1">
                            <label className="font-semibold text-white/80">Name</label>
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" required placeholder="Main Server" />
                        </div>
                        <div className="space-y-1">
                            <label className="font-semibold text-white/80">Hostname / IP</label>
                            <input value={form.hostname} onChange={e => setForm({ ...form, hostname: e.target.value })} className="input" required placeholder="192.168.1.10" />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3 text-sm">
                        <div className="space-y-1">
                            <label className="font-semibold text-white/80">Port</label>
                            <input value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} className="input" placeholder={form.type === 'radarr' ? '7878' : '8989'} />
                        </div>
                        <div className="space-y-1">
                            <label className="font-semibold text-white/80">URL Base</label>
                            <input value={form.urlBase} onChange={e => setForm({ ...form, urlBase: e.target.value })} className="input" placeholder="/radarr" />
                        </div>
                        <div className="flex flex-col justify-end pb-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={form.useSsl} onChange={e => setForm({ ...form, useSsl: e.target.checked })} className="rounded bg-white/5 border-white/10" />
                                <span className="text-xs font-semibold text-white/70">Use SSL</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-1 text-xs">
                        <label className="font-semibold text-white/80">API Key</label>
                        <input type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} className="input" placeholder={modal?.mode === "edit" ? "Stored (leave blank to keep)" : "Pasted from service settings"} required={modal?.mode === "create"} />
                    </div>

                    {form.type === "radarr" && (
                        <div className="space-y-3 pt-2 border-t border-white/5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">Radarr Config</h4>
                            <div className="grid gap-4 md:grid-cols-2 text-sm">
                                <div className="space-y-1">
                                    <label className="font-semibold text-white/80">Quality Profile</label>
                                    <input value={form.qualityProfileId} onChange={e => setForm({ ...form, qualityProfileId: e.target.value })} className="input" placeholder="Profile ID (e.g. 1)" />
                                </div>
                                <div className="space-y-1">
                                    <label className="font-semibold text-white/80">Root Folder</label>
                                    <input value={form.rootFolder} onChange={e => setForm({ ...form, rootFolder: e.target.value })} className="input" placeholder="/movies" />
                                </div>
                            </div>
                            <div className="space-y-1 text-sm">
                                <label className="font-semibold text-white/80">Tags</label>
                                <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="input" placeholder="lemedia" />
                            </div>
                        </div>
                    )}

                    {form.type === "sonarr" && (
                        <div className="space-y-3 pt-2 border-t border-white/5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">Sonarr Config</h4>
                            <div className="grid gap-4 md:grid-cols-2 text-sm">
                                <div className="space-y-1">
                                    <label className="font-semibold text-white/80">Series Type</label>
                                    <input value={form.seriesType} onChange={e => setForm({ ...form, seriesType: e.target.value })} className="input" placeholder="standard" />
                                </div>
                                <div className="space-y-1">
                                    <label className="font-semibold text-white/80">Quality Profile</label>
                                    <input value={form.qualityProfileId} onChange={e => setForm({ ...form, qualityProfileId: e.target.value })} className="input" placeholder="Profile ID (e.g. 1)" />
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2 text-sm">
                                <div className="space-y-1">
                                    <label className="font-semibold text-white/80">Root Folder</label>
                                    <input value={form.rootFolder} onChange={e => setForm({ ...form, rootFolder: e.target.value })} className="input" placeholder="/tv" />
                                </div>
                                <div className="space-y-1">
                                    <label className="font-semibold text-white/80">Tags</label>
                                    <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="input" placeholder="lemedia" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <input type="checkbox" checked={form.seasonFolders} onChange={e => setForm({ ...form, seasonFolders: e.target.checked })} />
                                <span className="text-sm font-semibold text-white/80">Season Folders</span>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-white/70 hover:text-white transition-colors">
                            <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Enabled
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-white/70 hover:text-white transition-colors">
                            <input type="checkbox" checked={form.defaultServer} onChange={e => setForm({ ...form, defaultServer: e.target.checked })} /> Default Server
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-white/70 hover:text-white transition-colors">
                            <input type="checkbox" checked={form.fourKServer} onChange={e => setForm({ ...form, fourKServer: e.target.checked })} /> 4K Server
                        </label>
                    </div>

                    <div className="border-t border-white/5 pt-4">
                        <button type="button" onClick={runTest} disabled={testing} className="w-full py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-bold hover:bg-white/10 transition-all">
                            {testing ? "Testing..." : "Test Connection"}
                        </button>
                        {testMessage && <p className={`mt-2 text-center text-[10px] font-bold ${testMessage.includes('succeeded') ? 'text-emerald-400' : 'text-red-400'}`}>{testMessage}</p>}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button type="button" onClick={handleClose} className="px-4 py-2 text-xs font-bold text-white/60 hover:text-white">Cancel</button>
                        <button type="submit" disabled={submitting} className="px-6 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20">
                            {submitting ? "Saving..." : modal?.mode === "edit" ? "Save Changes" : "Add Service"}
                        </button>
                    </div>
                </form>
            </Modal>
            </div>
        </div>
    );
}
