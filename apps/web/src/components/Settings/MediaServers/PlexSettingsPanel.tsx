"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import PlexLogo from "@/assets/services/plex.svg";

type PlexLibrary = {
    id: string;
    name: string;
    type: "movie" | "show";
    enabled: boolean;
};

type PlexFormState = {
    enabled: boolean;
    name: string;
    hostname: string;
    port: number | "";
    useSsl: boolean;
    urlBase: string;
    externalUrl: string;
    serverId: string;
    hasToken: boolean;
    token: string;
};

const initialState: PlexFormState = {
    enabled: false,
    name: "",
    hostname: "",
    port: 32400,
    useSsl: false,
    urlBase: "",
    externalUrl: "",
    serverId: "",
    hasToken: false,
    token: ""
};

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
});

export function PlexSettingsPanel() {
    const toast = useToast();
    const [form, setForm] = useState<PlexFormState>(initialState);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [testing, setTesting] = useState(false);
    const [syncingAvailability, setSyncingAvailability] = useState(false);
    const sslId = useId();

    const { data, isLoading, mutate } = useSWR("/api/v1/admin/settings/plex", fetcher, {
        revalidateOnFocus: false,
        onError: () => toast.error("Unable to load Plex settings"),
    });

    useEffect(() => {
        if (data) {
            setForm({
                enabled: Boolean(data.enabled),
                name: data.name ?? "",
                hostname: data.hostname ?? "",
                port: Number.isFinite(data.port) ? data.port : 32400,
                useSsl: Boolean(data.useSsl),
                urlBase: data.urlBase ?? "",
                externalUrl: data.externalUrl ?? "",
                serverId: data.serverId ?? "",
                hasToken: Boolean(data.hasToken),
                token: ""
            });
        }
    }, [data]);

    const updateForm = (patch: Partial<PlexFormState>) => {
        setForm(prev => ({ ...prev, ...patch }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        setSaving(true);
        try {
            const res = await csrfFetch("/api/v1/admin/settings/plex", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    enabled: form.enabled,
                    hostname: form.hostname.trim(),
                    port: Number(form.port),
                    useSsl: form.useSsl,
                    urlBase: form.urlBase.trim(),
                    externalUrl: form.externalUrl.trim(),
                    token: form.token.trim()
                })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Plex settings");
            }
            toast.success("Plex settings saved");
            updateForm({ token: "" });
            mutate();
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to save Plex settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await csrfFetch("/api/v1/admin/settings/plex/test", { method: "POST", credentials: "include" });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Plex test failed");
            }
            toast.success(`Connected to ${body?.name ?? "Plex"}`);
            mutate();
        } catch (err: any) {
            toast.error(err?.message ?? "Plex test failed");
        } finally {
            setTesting(false);
        }
    };

    const handleSyncLibraries = async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/v1/admin/settings/plex/library?sync=true", { credentials: "include" });
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

    const handleAvailabilitySync = async () => {
        setSyncingAvailability(true);
        try {
            const res = await csrfFetch("/api/v1/admin/settings/plex/availability-sync", {
                method: "POST",
                credentials: "include"
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Availability sync failed");
            }
            toast.success("Availability sync started");
        } catch (err: any) {
            toast.error(err?.message ?? "Availability sync failed");
        } finally {
            setSyncingAvailability(false);
        }
    };

    const toggleLibrary = async (id: string, enabled: boolean) => {
        const current = Array.isArray(data?.libraries) ? data.libraries : [];
        const updated = current.map((lib: PlexLibrary) => (lib.id === id ? { ...lib, enabled } : lib));
        const enabledIds = updated.filter((lib: PlexLibrary) => lib.enabled).map((lib: PlexLibrary) => lib.id);
        try {
            const res = await fetch(`/api/v1/admin/settings/plex/library?enable=${encodeURIComponent(enabledIds.join(","))}`, {
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

    const libraries: PlexLibrary[] = Array.isArray(data?.libraries) ? data.libraries : [];

    return (
        <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-6 border-b border-white/10">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                <div className="relative flex items-center gap-4">
                    <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-white/10">
                        <Image src={PlexLogo} alt="Plex" className="w-7 h-7" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Plex Media Server</h3>
                        <p className="text-sm text-white/60">Configure Plex connectivity and library scanning</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div>
                        <div className="text-sm font-semibold text-white">Enable Plex</div>
                        <div className="text-xs text-white/60">When disabled, Plex APIs and scans are turned off.</div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-white/80">
                        <input
                            type="checkbox"
                            checked={form.enabled}
                            onChange={(e) => updateForm({ enabled: e.target.checked })}
                            className="h-4 w-4 rounded border-white/20 bg-white/10"
                        />
                        Enabled
                    </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="block text-xs text-white/60 mb-1">Server Name</label>
                        <input
                            type="text"
                            value={form.name}
                            readOnly
                            className="input text-sm opacity-70"
                            placeholder="Detected after test"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-white/60 mb-1">Server ID</label>
                        <input
                            type="text"
                            value={form.serverId}
                            readOnly
                            className="input text-sm opacity-70"
                            placeholder="Detected after test"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-white/60 mb-1">Hostname</label>
                        <input
                            type="text"
                            value={form.hostname}
                            onChange={(e) => updateForm({ hostname: e.target.value })}
                            className="input text-sm"
                            placeholder="plex.local"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-white/60 mb-1">Port</label>
                        <input
                            type="number"
                            value={form.port}
                            onChange={(e) => updateForm({ port: e.target.value === "" ? "" : Number(e.target.value) })}
                            className="input text-sm"
                            placeholder="32400"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-white/60 mb-1">URL Base</label>
                        <input
                            type="text"
                            value={form.urlBase}
                            onChange={(e) => updateForm({ urlBase: e.target.value })}
                            className="input text-sm"
                            placeholder="/plex"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-white/60 mb-1">External URL</label>
                        <input
                            type="text"
                            value={form.externalUrl}
                            onChange={(e) => updateForm({ externalUrl: e.target.value })}
                            className="input text-sm"
                            placeholder="https://plex.yourdomain.com"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <input
                        id={sslId}
                        type="checkbox"
                        checked={form.useSsl}
                        onChange={(e) => updateForm({ useSsl: e.target.checked })}
                        className="h-4 w-4 rounded border-white/20 bg-white/10"
                    />
                    <label htmlFor={sslId} className="text-sm text-white/80">Use SSL (HTTPS)</label>
                </div>

                <div>
                    <label className="block text-xs text-white/60 mb-1">Plex Token</label>
                    <input
                        type="password"
                        value={form.token}
                        onChange={(e) => updateForm({ token: e.target.value })}
                        className="input text-sm"
                        placeholder={form.hasToken ? "Token stored" : "Enter Plex token"}
                    />
                    <p className="text-xs text-white/50 mt-1">Leave blank to keep the existing token.</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        type="submit"
                        disabled={saving || isLoading}
                        className="btn btn-primary"
                    >
                        {saving ? "Saving..." : "Save Settings"}
                    </button>
                    <button
                        type="button"
                        onClick={handleTest}
                        disabled={!form.enabled || testing}
                        className="btn btn-secondary"
                    >
                        {testing ? "Testing..." : "Test Connection"}
                    </button>
                    <button
                        type="button"
                        onClick={handleSyncLibraries}
                        disabled={!form.enabled || syncing}
                        className="btn btn-secondary"
                    >
                        {syncing ? "Syncing..." : "Sync Libraries"}
                    </button>
                    <button
                        type="button"
                        onClick={handleAvailabilitySync}
                        disabled={!form.enabled || syncingAvailability}
                        className="btn btn-secondary"
                    >
                        {syncingAvailability ? "Syncing..." : "Sync Availability Cache"}
                    </button>
                </div>

                <div className="pt-4 border-t border-white/10">
                    <div className="text-sm font-semibold text-white mb-3">Libraries</div>
                    {libraries.length === 0 ? (
                        <div className="text-sm text-white/50">No libraries synced yet.</div>
                    ) : (
                        <div className="grid gap-3">
                            {libraries.map((lib) => (
                                <label key={lib.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                    <div>
                                        <div className="text-sm text-white">{lib.name}</div>
                                        <div className="text-xs text-white/50 uppercase">{lib.type}</div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={lib.enabled}
                                        onChange={(e) => toggleLibrary(lib.id, e.target.checked)}
                                        disabled={!form.enabled}
                                        className="h-4 w-4 rounded border-white/20 bg-white/10"
                                    />
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
}
