"use client";

import { useEffect, useState, useId } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { csrfFetch } from "@/lib/csrf-client";
import useSWR from "swr";
import { JellyfinSetup } from "@/components/Auth/JellyfinSetup";

type JellyfinLibrary = {
    id: string;
    name: string;
    type: "movie" | "show";
    enabled: boolean;
};

type JellyfinFormState = {
    name: string;
    hostname: string;
    port: number | "";
    useSsl: boolean;
    urlBase: string;
    externalUrl: string;
    jellyfinForgotPasswordUrl: string;
    serverId: string;
    hasApiKey: boolean;
};

const initialState: JellyfinFormState = {
    name: "",
    hostname: "",
    port: 8096,
    useSsl: false,
    urlBase: "",
    externalUrl: "",
    jellyfinForgotPasswordUrl: "",
    serverId: "",
    hasApiKey: false
};

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
});

export function JellyfinSettingsPanel() {
    const toast = useToast();
    const [form, setForm] = useState<JellyfinFormState>(initialState);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [showSetup, setShowSetup] = useState(false);
    const sslId = useId();

    const { data, isLoading, mutate } = useSWR("/api/v1/admin/settings/jellyfin", fetcher, {
        revalidateOnFocus: false,
        onError: () => toast.error("Unable to load Jellyfin settings"),
    });
    const { data: syncStatus, mutate: mutateSync } = useSWR("/api/v1/admin/settings/jellyfin/sync", fetcher, {
        revalidateOnFocus: false,
        refreshInterval: 1000
    });
    const { data: newItemsData } = useSWR("/api/v1/admin/settings/jellyfin/new-items?limit=20", fetcher, {
        revalidateOnFocus: false,
        refreshInterval: syncStatus?.running ? 5000 : 30000
    });
    const { data: scanHistoryData } = useSWR("/api/v1/admin/settings/jellyfin/scan-history?limit=5", fetcher, {
        revalidateOnFocus: false,
        refreshInterval: 30000
    });

    useEffect(() => {
        if (data) {
            setForm({
                name: data.name ?? "",
                hostname: data.hostname ?? "",
                port: Number.isFinite(data.port) ? data.port : 8096,
                useSsl: Boolean(data.useSsl),
                urlBase: data.urlBase ?? "",
                externalUrl: data.externalUrl ?? "",
                jellyfinForgotPasswordUrl: data.jellyfinForgotPasswordUrl ?? "",
                serverId: data.serverId ?? "",
                hasApiKey: Boolean(data.hasApiKey)
            });
        }
    }, [data]);

    const updateForm = (patch: Partial<JellyfinFormState>) => {
        setForm(prev => ({ ...prev, ...patch }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        setSaving(true);
        try {
            const res = await csrfFetch("/api/v1/admin/settings/jellyfin", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    hostname: form.hostname.trim(),
                    port: Number(form.port),
                    useSsl: form.useSsl,
                    urlBase: form.urlBase.trim(),
                    externalUrl: form.externalUrl.trim(),
                    jellyfinForgotPasswordUrl: form.jellyfinForgotPasswordUrl.trim()
                })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Jellyfin settings");
            }
            toast.success("Jellyfin settings saved");
            mutate();
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to save Jellyfin settings");
        } finally {
            setSaving(false);
        }
    };

    const handleSyncLibraries = async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/v1/admin/settings/jellyfin/library?sync=true", { credentials: "include" });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Library sync failed");
            }
            toast.success("Libraries synced");
            mutate();
        } catch (err: any) {
            toast.error(err?.message ?? "Library sync failed");
        } finally {
            setSyncing(false);
        }
    };

    const toggleLibrary = async (id: string, enabled: boolean) => {
        const current = Array.isArray(data?.libraries) ? data.libraries : [];
        const updated = current.map((lib: JellyfinLibrary) => (lib.id === id ? { ...lib, enabled } : lib));
        const enabledIds = updated.filter((lib: JellyfinLibrary) => lib.enabled).map((lib: JellyfinLibrary) => lib.id);
        try {
            const res = await fetch(`/api/v1/admin/settings/jellyfin/library?enable=${encodeURIComponent(enabledIds.join(","))}`, {
                credentials: "include"
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to update library settings");
            }
            mutate();
        } catch (err: any) {
            toast.error(err?.message ?? "Failed to update library settings");
        }
    };

    const startScan = async () => {
        try {
            await csrfFetch("/api/v1/admin/settings/jellyfin/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ start: true })
            });
            mutateSync();
            toast.success("Scan started");
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to start scan");
        }
    };

    const cancelScan = async () => {
        try {
            await csrfFetch("/api/v1/admin/settings/jellyfin/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ cancel: true })
            });
            mutateSync();
            toast.success("Scan cancelled");
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to cancel scan");
        }
    };

    const syncAvailability = async () => {
        try {
            await csrfFetch("/api/v1/admin/settings/jellyfin/availability-sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include"
            });
            toast.success("Availability sync started in background");
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to start availability sync");
        }
    };

    const libraries: JellyfinLibrary[] = Array.isArray(data?.libraries) ? data.libraries : [];

    return (
        <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-6 space-y-6">
            <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Server</p>
                <h3 className="text-xl font-semibold text-white">Server Connection</h3>
                <p className="text-sm text-muted">Configure your Jellyfin server connection and settings.</p>
            </div>

            {showSetup ? (
                <div className="rounded-lg border border-white/10 bg-black/20 p-6">
                    <JellyfinSetup
                        isInitialSetup={!form.hasApiKey}
                        currentConfig={{
                            hostname: form.hostname,
                            port: typeof form.port === "number" ? form.port : undefined,
                            useSsl: form.useSsl,
                            urlBase: form.urlBase,
                            externalUrl: form.externalUrl
                        }}
                        onSuccess={() => {
                            setShowSetup(false);
                            mutate();
                        }}
                        onCancel={() => setShowSetup(false)}
                    />
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="rounded-md border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${form.hasApiKey ? 'bg-green-400' : 'bg-gray-500'}`} />
                                    <p className="text-sm font-semibold text-white">Connection Status</p>
                                </div>
                                <p className="text-sm text-muted mt-1">
                                    {form.hasApiKey
                                        ? `Connected to ${form.name || "Jellyfin server"}`
                                        : "Not configured"}
                                </p>
                                {form.serverId && (
                                    <p className="text-xs text-muted mt-1 font-mono">
                                        ID: {form.serverId}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowSetup(true)}
                                className="btn btn-primary"
                            >
                                {form.hasApiKey ? "Reconfigure" : "Connect to Jellyfin"}
                            </button>
                        </div>
                    </div>

                    {form.hasApiKey && (
                        <div className="rounded-md bg-sky-500/10 border border-sky-500/20 p-4">
                            <p className="font-semibold text-sky-300 text-sm">Secure Authentication</p>
                            <p className="text-sm text-muted mt-1">Jellyfin is configured using secure credential-based authentication. Click &quot;Reconfigure&quot; above to update your connection settings.</p>
                        </div>
                    )}
                </div>
            )}

            {form.hasApiKey && !showSetup && (
                <form onSubmit={handleSave} className="space-y-4 border-t border-white/10 pt-6">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted">Optional Settings</p>
                        <h4 className="text-lg font-semibold text-white">Additional Configuration</h4>
                        <p className="text-sm text-muted">Configure optional Jellyfin URLs.</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1 text-sm">
                            <label className="font-semibold text-white">Forgot Password URL (optional)</label>
                            <input
                                value={form.jellyfinForgotPasswordUrl}
                                onChange={event => updateForm({ jellyfinForgotPasswordUrl: event.target.value })}
                                className="w-full input"
                                placeholder="https://jellyfin.example.com/forgot"
                                disabled={isLoading}
                            />
                            <p className="text-xs text-muted">Custom URL for password reset (shown on login page)</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button className="btn btn-primary" type="submit" disabled={saving || isLoading}>
                            {saving ? "Saving…" : "Save optional settings"}
                        </button>
                    </div>
                </form>
            )}

            <div className="space-y-4 border-t border-white/10 pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted">Libraries</p>
                        <h4 className="text-lg font-semibold text-white">Library Settings</h4>
                        <p className="text-sm text-muted">Select the libraries used for availability checks.</p>
                    </div>
                    <button
                        className="btn"
                        type="button"
                        onClick={handleSyncLibraries}
                        disabled={syncing || isLoading}
                    >
                        {syncing ? "Syncing…" : "Sync Libraries"}
                    </button>
                </div>
                <div className="space-y-2">
                    {libraries.map((library) => (
                        <label
                            key={library.id}
                            className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm cursor-pointer hover:bg-white/10 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-lg">{library.type === "movie" ? "🎬" : "📺"}</span>
                                <div>
                                    <p className="font-semibold text-white">{library.name}</p>
                                    <p className="text-xs text-muted">{library.type === "movie" ? "Movies" : "TV Shows"}</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                className="h-5 w-5 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30"
                                checked={Boolean(library.enabled)}
                                onChange={(event) => toggleLibrary(library.id, event.target.checked)}
                                disabled={isLoading}
                            />
                        </label>
                    ))}
                    {!isLoading && libraries.length === 0 && (
                        <div className="rounded-md border border-white/10 bg-white/5 p-8 text-center">
                            <p className="text-sm text-muted">No libraries synced yet. Click &quot;Sync Libraries&quot; to get started.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-6">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Manual Scan</p>
                    <h4 className="text-lg font-semibold text-white">Manual library scan</h4>
                    <p className="text-sm text-muted">Trigger a one-time library scan to refresh availability and detect new content.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button className="btn" type="button" onClick={startScan} disabled={isLoading || syncStatus?.running}>
                        {syncStatus?.running ? "Scanning…" : "Start scan"}
                    </button>
                    <button className="btn" type="button" onClick={cancelScan} disabled={isLoading || !syncStatus?.running}>
                        Cancel scan
                    </button>
                    <button className="btn btn-primary" type="button" onClick={syncAvailability} disabled={isLoading}>
                        Sync Availability Cache
                    </button>
                </div>
                <p className="text-xs text-muted">
                    &quot;Start scan&quot; detects new content. &quot;Sync Availability Cache&quot; updates episode availability for TV show pages (runs hourly automatically).
                </p>
                <div className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-muted">Status</span>
                        <span className="font-semibold text-white">{syncStatus?.running ? "Running" : "Not running"}</span>
                    </div>
                    {syncStatus?.running && syncStatus.newItemsCount > 0 && (
                        <div className="flex items-center justify-between">
                            <span className="text-muted">New items found</span>
                            <span className="font-semibold text-green-400">{syncStatus.newItemsCount}</span>
                        </div>
                    )}
                    {syncStatus?.running && syncStatus.currentLibrary && (
                        <div className="flex items-center justify-between">
                            <span className="text-muted">Current library</span>
                            <span className="font-semibold text-white">{syncStatus.currentLibrary.name}</span>
                        </div>
                    )}
                    {syncStatus?.running && (
                        <div className="flex items-center justify-between">
                            <span className="text-muted">Progress</span>
                            <span className="font-semibold text-white">{syncStatus.progress} / {syncStatus.total}</span>
                        </div>
                    )}
                </div>

                {/* New Items Section */}
                {newItemsData?.newItems && newItemsData.newItems.length > 0 && (
                    <div className="space-y-2">
                        <h5 className="text-sm font-semibold text-white">Recently Added ({newItemsData.newItems.length})</h5>
                        <div className="max-h-64 overflow-y-auto space-y-1.5">
                            {newItemsData.newItems.map((item: any) => (
                                <div key={item.jellyfinItemId} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="font-semibold text-white">{item.title || "Unknown Title"}</div>
                                            <div className="text-muted">
                                                <span className="capitalize">{item.mediaType}</span>
                                                {item.tmdbId && <span> • TMDB: {item.tmdbId}</span>}
                                            </div>
                                        </div>
                                        <div className="text-muted text-right ml-2">
                                            {new Date(item.addedAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Scan History Section */}
                {scanHistoryData?.scans && scanHistoryData.scans.length > 0 && (
                    <div className="space-y-2">
                        <h5 className="text-sm font-semibold text-white">Scan History</h5>
                        <div className="max-h-64 overflow-y-auto space-y-1.5">
                            {scanHistoryData.scans.map((scan: any) => (
                                <div key={scan.id} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="font-semibold text-white">{scan.libraryName || "All Libraries"}</div>
                                        <div className={`text-xs font-semibold ${
                                            scan.scanStatus === "completed" ? "text-green-400" :
                                            scan.scanStatus === "failed" ? "text-red-400" :
                                            "text-yellow-400"
                                        }`}>
                                            {scan.scanStatus}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-muted">
                                        <div>
                                            Scanned: {scan.itemsScanned} | Added: <span className="text-green-400">{scan.itemsAdded}</span>
                                        </div>
                                        <div>
                                            {new Date(scan.scanStartedAt).toLocaleTimeString()}
                                        </div>
                                    </div>
                                    {scan.errorMessage && (
                                        <div className="mt-1 text-red-400 text-xs truncate">
                                            Error: {scan.errorMessage}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
