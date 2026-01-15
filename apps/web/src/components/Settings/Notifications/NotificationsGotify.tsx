"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { NotificationUserSelector } from "./NotificationUserSelector";
import NotificationTypeSelector from "./NotificationTypeSelector";

type GotifyNotificationSettings = {
    name: string;
    enabled: boolean;
    types: number;
    url: string;
    token: string;
    priority: number;
};

const initialState: GotifyNotificationSettings = {
    name: "",
    enabled: false,
    types: 0,
    url: "",
    token: "",
    priority: 5,
};

interface NotificationsGotifyProps {
    mode?: "create" | "edit";
    endpointId?: number;
}

export default function NotificationsGotify({
    mode = "edit",
    endpointId,
}: NotificationsGotifyProps) {
    const router = useRouter();
    const toast = useToast();
    const [form, setForm] = useState<GotifyNotificationSettings>(initialState);
    const [loading, setLoading] = useState(mode === "edit");
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (mode === "create") return;
        if (!endpointId) {
            toast.error("No endpoint ID provided");
            return;
        }

        let active = true;
        setLoading(true);
        fetch(`/api/v1/admin/notifications/gotify/${endpointId}`, { credentials: "include" })
            .then(async (res) => {
                if (!active) return;
                if (!res.ok) {
                    if (res.status === 404) {
                        toast.error("Notification endpoint not found");
                        router.push("/admin/settings/notifications/gotify");
                        return;
                    }
                    if (res.status === 401 || res.status === 403) {
                        toast.error("You must be an admin to view notification settings");
                        return;
                    }
                    throw new Error("Failed to load Gotify notification settings");
                }
                const data = await res.json();
                setForm({
                    name: data.name ?? "",
                    enabled: data.enabled ?? false,
                    types: data.types ?? 0,
                    url: data.config?.url ?? "",
                    token: data.config?.token ?? "",
                    priority: data.config?.priority ?? 5,
                });
            })
            .catch(() => {
                toast.error("Unable to load Gotify notification settings");
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mode, endpointId, toast, router]);

    const updateForm = (patch: Partial<GotifyNotificationSettings>) => {
        setForm((prev) => ({ ...prev, ...patch }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!form.name.trim()) {
            toast.error("Name is required");
            return;
        }

        if (form.enabled && !form.url.trim()) {
            toast.error("Server URL is required when agent is enabled");
            return;
        }

        if (form.enabled && !form.token.trim()) {
            toast.error("Application token is required when agent is enabled");
            return;
        }

        if (form.enabled && !form.types) {
            toast.error("You must select at least one notification type");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                enabled: form.enabled,
                types: form.types,
                config: {
                    url: form.url.trim(),
                    token: form.token.trim(),
                    priority: form.priority,
                },
            };

            let res;
            if (mode === "create") {
                res = await csrfFetch("/api/v1/admin/notifications/gotify/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            } else {
                res = await csrfFetch(`/api/v1/admin/notifications/gotify/${endpointId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Gotify notification settings");
            }

            toast.success(
                mode === "create"
                    ? "Gotify notification created successfully!"
                    : "Gotify notification settings saved successfully!"
            );
            router.push("/admin/settings/notifications/gotify");
        } catch (error: any) {
            toast.error(error.message || "Failed to save Gotify notification settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await csrfFetch("/api/v1/admin/notifications/gotify/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    enabled: true,
                    types: form.types,
                    config: {
                        url: form.url.trim(),
                        token: form.token.trim(),
                        priority: form.priority,
                    },
                }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to send test notification");
            }

            toast.success("Test Gotify notification sent successfully!");
        } catch (error: any) {
            toast.error(error.message || "Failed to send test Gotify notification");
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div className="p-4">Loading Gotify notification settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">
                    {mode === "create" ? "Create Gotify Notification" : "Edit Gotify Notification"}
                </h2>
                <p className="text-gray-400">Configure Gotify push notifications</p>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                <NotificationUserSelector />

                {/* Name */}
                <div className="form-row">
                    <label htmlFor="name" className="block text-sm font-medium mb-2">
                        Name
                        <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                        type="text"
                        id="name"
                        value={form.name}
                        onChange={(e) => updateForm({ name: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Main Gotify Server, etc."
                        required
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        A unique name to identify this notification endpoint
                    </p>
                </div>

                {/* Enable Agent */}
                <div className="form-row">
                    <AnimatedCheckbox
                        id="enabled"
                        label="Enable Agent"
                        checked={form.enabled}
                        onChange={(e) => updateForm({ enabled: e.target.checked })}
                    />
                </div>

                {/* Server URL */}
                <div className="form-row">
                    <label htmlFor="url" className="block text-sm font-medium mb-2">
                        Server URL
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="url"
                        id="url"
                        value={form.url}
                        onChange={(e) => updateForm({ url: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://gotify.example.com"
                        required={form.enabled}
                    />
                </div>

                {/* Application Token */}
                <div className="form-row">
                    <label htmlFor="token" className="block text-sm font-medium mb-2">
                        Application Token
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="password"
                        id="token"
                        value={form.token}
                        onChange={(e) => updateForm({ token: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="AbCdEfGhIjKlMnOp"
                        required={form.enabled}
                        autoComplete="off"
                    />
                </div>

                {/* Priority */}
                <div className="form-row">
                    <label htmlFor="priority" className="block text-sm font-medium mb-2">
                        Priority
                    </label>
                    <input
                        type="number"
                        id="priority"
                        value={form.priority}
                        onChange={(e) => updateForm({ priority: parseInt(e.target.value) || 5 })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        max="10"
                    />
                    <p className="text-sm text-gray-400 mt-1">Priority level (0-10, default: 5)</p>
                </div>

                {/* Notification Types */}
                <NotificationTypeSelector
                    currentTypes={form.enabled ? form.types : 0}
                    onUpdate={(types) => {
                        updateForm({ types });
                        if (types && !form.enabled) {
                            updateForm({ enabled: true });
                        }
                    }}
                    error={form.enabled && !form.types ? "You must select at least one notification type" : undefined}
                />

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={() => router.push("/admin/settings/notifications/gotify")}
                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleTest}
                        disabled={saving || testing}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {testing ? "Testing..." : "Test Notification"}
                    </button>
                    <button
                        type="submit"
                        disabled={saving || testing || (form.enabled && !form.types)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Saving..." : mode === "create" ? "Create" : "Save Changes"}
                    </button>
                </div>
            </form>
        </div>
    );
}
