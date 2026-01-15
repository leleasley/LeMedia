"use client";

import { useEffect, useState, useId } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { csrfFetch } from "@/lib/csrf-client";
import useSWR from "swr";

type JellyfinFormState = {
    hostname: string;
    port: number | "";
    useSsl: boolean;
    urlBase: string;
    externalUrl: string;
    apiKey: string;
    hasApiKey: boolean;
};

const initialState: JellyfinFormState = {
    hostname: "",
    port: 8096,
    useSsl: false,
    urlBase: "",
    externalUrl: "",
    apiKey: "",
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
    const [testing, setTesting] = useState(false);
    const sslId = useId();

    const { data, isLoading, mutate } = useSWR("/api/v1/admin/settings/jellyfin", fetcher, {
        revalidateOnFocus: false,
        onError: () => toast.error("Unable to load Jellyfin settings"),
    });

    useEffect(() => {
        if (data) {
            setForm({
                hostname: data.hostname ?? "",
                port: Number.isFinite(data.port) ? data.port : 8096,
                useSsl: Boolean(data.useSsl),
                urlBase: data.urlBase ?? "",
                externalUrl: data.externalUrl ?? "",
                apiKey: "",
                hasApiKey: Boolean(data.hasApiKey)
            });
        }
    }, [data]);

    const updateForm = (patch: Partial<JellyfinFormState>) => {
        setForm(prev => ({ ...prev, ...patch }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!form.hostname.trim()) {
            toast.error("Hostname is required");
            return;
        }
        if (form.port === "" || !Number.isFinite(Number(form.port))) {
            toast.error("Port must be a valid number");
            return;
        }

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
                    apiKey: form.apiKey.trim()
                })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Jellyfin settings");
            }
            toast.success("Jellyfin settings saved");
            setForm(prev => ({ ...prev, apiKey: "", hasApiKey: prev.hasApiKey || !!prev.apiKey }));
            mutate(); // Refresh
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to save Jellyfin settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        if (!form.hostname.trim()) {
            toast.error("Hostname is required to test");
            return;
        }
        if (form.port === "" || !Number.isFinite(Number(form.port))) {
            toast.error("Port must be a valid number");
            return;
        }
        if (!form.apiKey.trim()) {
            toast.error("API key is required for testing");
            return;
        }
        setTesting(true);
        try {
            const res = await csrfFetch("/api/v1/admin/settings/jellyfin/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    hostname: form.hostname.trim(),
                    port: Number(form.port),
                    useSsl: form.useSsl,
                    urlBase: form.urlBase.trim(),
                    apiKey: form.apiKey.trim()
                })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Connection failed");
            }
            toast.success("Connection succeeded");
        } catch (err: any) {
            toast.error(err?.message ?? "Connection failed");
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/10 space-y-6">
            <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Jellyfin</p>
                <h3 className="text-xl font-semibold text-white">Jellyfin settings</h3>
                <p className="text-sm text-muted">
                    Configure the internal Jellyfin endpoint and API key used for availability checks.
                </p>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Hostname or IP</label>
                        <input
                            value={form.hostname}
                            onChange={event => updateForm({ hostname: event.target.value })}
                            className="w-full input"
                            placeholder="jellyfin.local"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Port</label>
                        <input
                            type="number"
                            value={form.port}
                            onChange={event =>
                                updateForm({
                                    port: event.target.value === "" ? "" : Number(event.target.value)
                                })
                            }
                            className="w-full input"
                            disabled={isLoading}
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">URL Base</label>
                        <input
                            value={form.urlBase}
                            onChange={event => updateForm({ urlBase: event.target.value })}
                            className="w-full input"
                            placeholder="/jellyfin"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">External URL (optional)</label>
                        <input
                            value={form.externalUrl}
                            onChange={event => updateForm({ externalUrl: event.target.value })}
                            className="w-full input"
                            placeholder="https://jellyfin.example.com"
                            disabled={isLoading}
                        />
                    </div>
                </div>

                <AnimatedCheckbox
                    id={sslId}
                    label="Use SSL for internal requests"
                    checked={form.useSsl}
                    onChange={event => updateForm({ useSsl: event.target.checked })}
                    disabled={isLoading}
                />

                <div className="space-y-1 text-sm">
                    <label className="font-semibold text-white">API key</label>
                    <input
                        type="password"
                        value={form.apiKey}
                        onChange={event => updateForm({ apiKey: event.target.value })}
                        className="w-full input"
                        placeholder={form.hasApiKey ? "Stored (leave blank to keep)" : "Enter API key"}
                        disabled={isLoading}
                    />
                    <p className="text-xs text-muted">
                        {form.hasApiKey ? "An API key is already stored." : "Create an API key in Jellyfin and paste it here."}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button className="btn" type="button" onClick={handleTest} disabled={testing || isLoading}>
                        {testing ? "Testing…" : "Test connection"}
                    </button>
                    <button className="btn btn-primary" type="submit" disabled={saving || isLoading}>
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </form>
        </div>
    );
}