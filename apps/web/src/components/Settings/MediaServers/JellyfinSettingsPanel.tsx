"use client";

import { useEffect, useState, useId } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import useSWR from "swr";
import { JellyfinSetup } from "@/components/auth/JellyfinSetup";

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

type JobInfo = {
    lastRun: string | null;
    nextRun: string | null;
    enabled: boolean;
    failureCount: number;
    lastError: string | null;
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

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        failed: "bg-red-500/20 text-red-300 border-red-500/30",
        running: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${styles[status] ?? styles.running}`}>
            {status}
        </span>
    );
}

function formatRelativeTime(date: string | null): string {
    if (!date) return "Never";
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return then.toLocaleDateString();
}

export function JellyfinSettingsPanel() {
    const toast = useToast();
    const [form, setForm] = useState<JellyfinFormState>(initialState);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [showSetup, setShowSetup] = useState(false);
    const [expandedSection, setExpandedSection] = useState<string | null>("connection");
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
    const { data: scanHistoryData } = useSWR("/api/v1/admin/settings/jellyfin/scan-history?limit=10", fetcher, {
        revalidateOnFocus: false,
        refreshInterval: 30000
    });
    const { data: jobsData } = useSWR<any[]>("/api/v1/admin/jobs", fetcher, {
        revalidateOnFocus: false,
        refreshInterval: 30000
    });

    // Find the availability sync job
    const availabilityJob = Array.isArray(jobsData)
        ? jobsData.find((job: any) => job.name === "jellyfin-availability-sync")
        : null;

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

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    return (
        <div className="space-y-4">
            {/* Connection Status Card */}
            <div className="glass-strong rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                <button
                    onClick={() => toggleSection("connection")}
                    className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${form.hasApiKey ? "bg-emerald-500/20 ring-1 ring-emerald-500/30" : "bg-gray-500/20 ring-1 ring-gray-500/30"}`}>
                            {form.hasApiKey ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-emerald-400">
                                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-400">
                                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                                </svg>
                            )}
                        </div>
                        <div className="text-left">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-white">Server Connection</h3>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${form.hasApiKey ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"}`}>
                                    {form.hasApiKey ? "Connected" : "Not Configured"}
                                </span>
                            </div>
                            <p className="text-sm text-gray-400">
                                {form.hasApiKey ? `${form.name || "Jellyfin Server"}` : "Configure your Jellyfin server connection"}
                            </p>
                        </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === "connection" ? "rotate-180" : ""}`}>
                        <path fillRule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clipRule="evenodd" />
                    </svg>
                </button>

                {expandedSection === "connection" && (
                    <div className="border-t border-white/10 p-5 space-y-4">
                        {showSetup ? (
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
                        ) : (
                            <>
                                {form.hasApiKey && (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Server Name</p>
                                            <p className="font-semibold text-white">{form.name || "Unknown"}</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Server ID</p>
                                            <p className="font-mono text-sm text-gray-300 truncate">{form.serverId || "Unknown"}</p>
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={() => setShowSetup(true)}
                                    className="btn btn-primary"
                                >
                                    {form.hasApiKey ? "Reconfigure Connection" : "Connect to Jellyfin"}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Libraries Card */}
            {form.hasApiKey && (
                <div className="glass-strong rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                    <button
                        onClick={() => toggleSection("libraries")}
                        className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/20 ring-1 ring-blue-500/30 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-blue-400">
                                    <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
                                </svg>
                            </div>
                            <div className="text-left">
                                <h3 className="font-semibold text-white">Libraries</h3>
                                <p className="text-sm text-gray-400">
                                    {libraries.filter(l => l.enabled).length} of {libraries.length} enabled
                                </p>
                            </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === "libraries" ? "rotate-180" : ""}`}>
                            <path fillRule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clipRule="evenodd" />
                        </svg>
                    </button>

                    {expandedSection === "libraries" && (
                        <div className="border-t border-white/10 p-5 space-y-4">
                            <div className="flex justify-end">
                                <button
                                    className="btn text-sm"
                                    onClick={handleSyncLibraries}
                                    disabled={syncing || isLoading}
                                >
                                    {syncing ? "Syncing..." : "Refresh Libraries"}
                                </button>
                            </div>
                            <div className="grid gap-2">
                                {libraries.map((library) => (
                                    <label
                                        key={library.id}
                                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 cursor-pointer hover:bg-white/10 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{library.type === "movie" ? "🎬" : "📺"}</span>
                                            <div>
                                                <p className="font-semibold text-white">{library.name}</p>
                                                <p className="text-xs text-gray-500">{library.type === "movie" ? "Movies" : "TV Shows"}</p>
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={Boolean(library.enabled)}
                                                onChange={(event) => toggleLibrary(library.id, event.target.checked)}
                                                disabled={isLoading}
                                            />
                                            <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-purple-500/50 transition-colors" />
                                            <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                                        </div>
                                    </label>
                                ))}
                                {!isLoading && libraries.length === 0 && (
                                    <div className="text-center py-8 text-gray-500">
                                        <p>No libraries found. Click &quot;Refresh Libraries&quot; to sync.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Manual Scan & History Card */}
            {form.hasApiKey && (
                <div className="glass-strong rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                    <button
                        onClick={() => toggleSection("scan")}
                        className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors"
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${syncStatus?.running ? "bg-amber-500/20 ring-1 ring-amber-500/30" : "bg-purple-500/20 ring-1 ring-purple-500/30"}`}>
                                {syncStatus?.running ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-amber-400 animate-spin">
                                        <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-purple-400">
                                        <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                            <div className="text-left">
                                <h3 className="font-semibold text-white">Scanning & Sync</h3>
                                <p className="text-sm text-gray-400">
                                    {syncStatus?.running ? `Scanning ${syncStatus.currentLibrary?.name || "libraries"}...` : "Run manual scans and view history"}
                                </p>
                            </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === "scan" ? "rotate-180" : ""}`}>
                            <path fillRule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clipRule="evenodd" />
                        </svg>
                    </button>

                    {expandedSection === "scan" && (
                        <div className="border-t border-white/10">
                            {/* Live Scan Status */}
                            {syncStatus?.running && (
                                <div className="p-5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-white/10">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                            <span className="text-sm font-semibold text-amber-300">Scan in Progress</span>
                                        </div>
                                        <button
                                            onClick={cancelScan}
                                            className="text-xs text-red-400 hover:text-red-300 font-medium"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Library</span>
                                            <span className="text-white font-medium">{syncStatus.currentLibrary?.name || "Unknown"}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Progress</span>
                                            <span className="text-white font-medium">{syncStatus.progress} / {syncStatus.total}</span>
                                        </div>
                                        {syncStatus.newItemsCount > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">New Items Found</span>
                                                <span className="text-emerald-400 font-medium">+{syncStatus.newItemsCount}</span>
                                            </div>
                                        )}
                                        <div className="w-full bg-white/10 rounded-full h-2 mt-2">
                                            <div
                                                className="bg-gradient-to-r from-amber-500 to-orange-500 h-2 rounded-full transition-all"
                                                style={{ width: `${syncStatus.total > 0 ? (syncStatus.progress / syncStatus.total) * 100 : 0}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="p-5 space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <button
                                        onClick={startScan}
                                        disabled={isLoading || syncStatus?.running}
                                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-300 font-semibold hover:from-purple-500/30 hover:to-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                                        </svg>
                                        {syncStatus?.running ? "Scanning..." : "Full Library Scan"}
                                    </button>
                                    <button
                                        onClick={syncAvailability}
                                        disabled={isLoading}
                                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-300 font-semibold hover:from-emerald-500/30 hover:to-teal-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
                                        </svg>
                                        Quick Availability Sync
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500">
                                    <strong>Full Library Scan</strong> detects new content and updates availability. <strong>Quick Availability Sync</strong> refreshes episode availability cache (runs automatically every 4 hours).
                                </p>
                            </div>

                            {/* Scheduled Job Info */}
                            {availabilityJob && (
                                <div className="px-5 pb-5">
                                    <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                                        <div className="flex items-center gap-2 mb-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-400">
                                                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                                            </svg>
                                            <span className="text-sm font-semibold text-blue-300">Scheduled Availability Sync</span>
                                        </div>
                                        <div className="grid gap-2 text-xs">
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Last Run</span>
                                                <span className="text-white">{formatRelativeTime(availabilityJob.lastRun)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Next Run</span>
                                                <span className="text-white">{availabilityJob.nextRun ? new Date(availabilityJob.nextRun).toLocaleString() : "Pending"}</span>
                                            </div>
                                            {availabilityJob.lastError && (
                                                <div className="mt-1 text-amber-400">
                                                    Last error: {availabilityJob.lastError}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Scan History */}
                            <div className="px-5 pb-5">
                                <h4 className="text-sm font-semibold text-white mb-3">Scan History</h4>
                                {scanHistoryData?.scans && scanHistoryData.scans.length > 0 ? (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {scanHistoryData.scans.map((scan: any) => (
                                            <div key={scan.id} className="p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-white">{scan.libraryName || "All Libraries"}</span>
                                                        <StatusBadge status={scan.scanStatus} />
                                                    </div>
                                                    <span className="text-xs text-gray-500">{formatRelativeTime(scan.scanStartedAt)}</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-xs text-gray-400">
                                                    <span>Scanned: <span className="text-white">{scan.itemsScanned}</span></span>
                                                    <span>Added: <span className="text-emerald-400">+{scan.itemsAdded}</span></span>
                                                    {scan.itemsRemoved > 0 && (
                                                        <span>Removed: <span className="text-red-400">-{scan.itemsRemoved}</span></span>
                                                    )}
                                                </div>
                                                {scan.errorMessage && (
                                                    <p className="mt-2 text-xs text-red-400 truncate">{scan.errorMessage}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-gray-500 text-sm">
                                        No scan history yet
                                    </div>
                                )}
                            </div>

                            {/* Recently Added Items */}
                            {newItemsData?.newItems && newItemsData.newItems.length > 0 && (
                                <div className="px-5 pb-5">
                                    <h4 className="text-sm font-semibold text-white mb-3">Recently Added ({newItemsData.newItems.length})</h4>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {newItemsData.newItems.slice(0, 10).map((item: any) => (
                                            <div key={item.jellyfinItemId} className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-lg flex-shrink-0">{item.mediaType === "movie" ? "🎬" : item.mediaType === "episode" ? "📺" : "📁"}</span>
                                                    <div className="min-w-0">
                                                        <p className="text-sm text-white truncate">{item.title || "Unknown"}</p>
                                                        <p className="text-xs text-gray-500 capitalize">{item.mediaType}</p>
                                                    </div>
                                                </div>
                                                <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{formatRelativeTime(item.addedAt)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Optional Settings Card */}
            {form.hasApiKey && !showSetup && (
                <div className="glass-strong rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                    <button
                        onClick={() => toggleSection("optional")}
                        className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gray-500/20 ring-1 ring-gray-500/30 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-400">
                                    <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 5.003a8.952 8.952 0 00-.883.36l-1.44-.864a1.875 1.875 0 00-2.367.294l-.81.81a1.875 1.875 0 00-.294 2.367l.864 1.44c-.14.285-.262.58-.36.883l-1.186.178a1.875 1.875 0 00-1.567 1.85v1.146c0 .917.663 1.699 1.567 1.85l1.186.178c.098.303.22.598.36.883l-.864 1.44a1.875 1.875 0 00.294 2.367l.81.81a1.875 1.875 0 002.367.294l1.44-.864c.285.14.58.262.883.36l.178 1.186a1.875 1.875 0 001.85 1.567h1.146c.917 0 1.699-.663 1.85-1.567l.178-1.186c.303-.098.598-.22.883-.36l1.44.864a1.875 1.875 0 002.367-.294l.81-.81a1.875 1.875 0 00.294-2.367l-.864-1.44c.14-.285.262-.58.36-.883l1.186-.178a1.875 1.875 0 001.567-1.85v-1.146c0-.917-.663-1.699-1.567-1.85l-1.186-.178a8.953 8.953 0 00-.36-.883l.864-1.44a1.875 1.875 0 00-.294-2.367l-.81-.81a1.875 1.875 0 00-2.367-.294l-1.44.864a8.953 8.953 0 00-.883-.36l-.178-1.186a1.875 1.875 0 00-1.85-1.567h-1.146zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="text-left">
                                <h3 className="font-semibold text-white">Additional Settings</h3>
                                <p className="text-sm text-gray-400">Configure optional URLs and integrations</p>
                            </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === "optional" ? "rotate-180" : ""}`}>
                            <path fillRule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clipRule="evenodd" />
                        </svg>
                    </button>

                    {expandedSection === "optional" && (
                        <div className="border-t border-white/10 p-5">
                            <form onSubmit={handleSave} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-white">Forgot Password URL</label>
                                    <input
                                        value={form.jellyfinForgotPasswordUrl}
                                        onChange={event => updateForm({ jellyfinForgotPasswordUrl: event.target.value })}
                                        className="w-full input"
                                        placeholder="https://jellyfin.example.com/forgot"
                                        disabled={isLoading}
                                    />
                                    <p className="text-xs text-gray-500">Custom URL for password reset (shown on login page)</p>
                                </div>
                                <button className="btn btn-primary" type="submit" disabled={saving || isLoading}>
                                    {saving ? "Saving..." : "Save Settings"}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
