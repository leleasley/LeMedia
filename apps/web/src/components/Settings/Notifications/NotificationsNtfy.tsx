"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { NotificationUserSelector } from "./NotificationUserSelector";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import NotificationTypeSelector from "./NotificationTypeSelector";

type NtfyNotificationSettings = {
    name: string;
    enabled: boolean;
    types: number;
    ntfyUrl: string;
    ntfyTopic: string;
    ntfyPriority: number;
    username: string;
    password: string;
    ntfyAuthMethod: "none" | "basic" | "access_token";
    accessToken: string;
};

const initialState: NtfyNotificationSettings = {
    name: "",
    enabled: false,
    types: 0,
    ntfyUrl: "https://ntfy.sh",
    ntfyTopic: "",
    ntfyPriority: 3,
    username: "",
    password: "",
    ntfyAuthMethod: "none",
    accessToken: "",
};

interface NotificationsNtfyProps {
    mode?: "create" | "edit";
    endpointId?: number;
}

export default function NotificationsNtfy({
    mode = "edit",
    endpointId,
}: NotificationsNtfyProps) {
    const router = useRouter();
    const toast = useToast();
    const [form, setForm] = useState<NtfyNotificationSettings>(initialState);
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
        fetch(`/api/v1/admin/notifications/ntfy/${endpointId}`, { credentials: "include" })
            .then(async (res) => {
                if (!active) return;
                if (!res.ok) {
                    if (res.status === 404) {
                        toast.error("Notification endpoint not found");
                        router.push("/admin/settings/notifications/ntfy");
                        return;
                    }
                    if (res.status === 401 || res.status === 403) {
                        toast.error("You must be an admin to view notification settings");
                        return;
                    }
                    throw new Error("Failed to load Ntfy notification settings");
                }
                const data = await res.json();
                setForm({
                    name: data.name ?? "",
                    enabled: data.enabled ?? false,
                    types: data.types ?? 0,
                    ntfyUrl: data.config?.ntfyUrl ?? "https://ntfy.sh",
                    ntfyTopic: data.config?.ntfyTopic ?? "",
                    ntfyPriority: data.config?.ntfyPriority ?? 3,
                    username: data.config?.username ?? "",
                    password: "",
                    ntfyAuthMethod: data.config?.ntfyAuthMethod ?? "none",
                    accessToken: "",
                });
            })
            .catch(() => {
                toast.error("Unable to load Ntfy notification settings");
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mode, endpointId, toast, router]);

    const updateForm = (patch: Partial<NtfyNotificationSettings>) => {
        setForm((prev) => ({ ...prev, ...patch }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!form.name.trim()) {
            toast.error("Name is required");
            return;
        }

        if (form.enabled && !form.ntfyUrl.trim()) {
            toast.error("Ntfy URL is required when agent is enabled");
            return;
        }

        if (form.enabled && !form.ntfyTopic.trim()) {
            toast.error("Topic is required when agent is enabled");
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
                    ntfyUrl: form.ntfyUrl.trim(),
                    ntfyTopic: form.ntfyTopic.trim(),
                    ntfyPriority: form.ntfyPriority,
                    username: form.username.trim(),
                    password: form.password.trim(),
                    ntfyAuthMethod: form.ntfyAuthMethod,
                    accessToken: form.accessToken.trim(),
                },
            };

            let res;
            if (mode === "create") {
                res = await csrfFetch("/api/v1/admin/notifications/ntfy/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            } else {
                res = await csrfFetch(`/api/v1/admin/notifications/ntfy/${endpointId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Ntfy notification settings");
            }

            toast.success(
                mode === "create"
                    ? "Ntfy notification created successfully!"
                    : "Ntfy notification settings saved successfully!"
            );
            router.push("/admin/settings/notifications/ntfy");
        } catch (error: any) {
            toast.error(error.message || "Failed to save Ntfy notification settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await csrfFetch("/api/v1/admin/notifications/ntfy/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    enabled: true,
                    types: form.types,
                    config: {
                        ntfyUrl: form.ntfyUrl.trim(),
                        ntfyTopic: form.ntfyTopic.trim(),
                        ntfyPriority: form.ntfyPriority,
                        username: form.username.trim(),
                        password: form.password.trim(),
                        ntfyAuthMethod: form.ntfyAuthMethod,
                        accessToken: form.accessToken.trim(),
                    },
                }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to send test notification");
            }

            toast.success("Test Ntfy notification sent successfully!");
        } catch (error: any) {
            toast.error(error.message || "Failed to send test Ntfy notification");
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div className="p-4">Loading Ntfy notification settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">
                    {mode === "create" ? "Create Ntfy Notification" : "Edit Ntfy Notification"}
                </h2>
                <p className="text-gray-400">Configure Ntfy push notifications</p>
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
                        placeholder="e.g., Main Ntfy Server, etc."
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

                {/* Ntfy URL */}
                <div className="form-row">
                    <label htmlFor="ntfyUrl" className="block text-sm font-medium mb-2">
                        Ntfy URL
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="url"
                        id="ntfyUrl"
                        value={form.ntfyUrl}
                        onChange={(e) => updateForm({ ntfyUrl: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://ntfy.sh"
                        required={form.enabled}
                    />
                </div>

                {/* Topic */}
                <div className="form-row">
                    <label htmlFor="ntfyTopic" className="block text-sm font-medium mb-2">
                        Topic
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="text"
                        id="ntfyTopic"
                        value={form.ntfyTopic}
                        onChange={(e) => updateForm({ ntfyTopic: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="lemedia-notifications"
                        required={form.enabled}
                    />
                </div>

                {/* Priority */}
                <div className="form-row">
                    <label htmlFor="ntfyPriority" className="block text-sm font-medium mb-2">
                        Priority
                    </label>
                    <Select
                        value={String(form.ntfyPriority)}
                        onValueChange={(value) => updateForm({ ntfyPriority: parseInt(value) })}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">Min</SelectItem>
                            <SelectItem value="2">Low</SelectItem>
                            <SelectItem value="3">Default</SelectItem>
                            <SelectItem value="4">High</SelectItem>
                            <SelectItem value="5">Urgent</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Auth Method */}
                <div className="form-row">
                    <label htmlFor="ntfyAuthMethod" className="block text-sm font-medium mb-2">
                        Authentication Method
                    </label>
                    <Select
                        value={form.ntfyAuthMethod}
                        onValueChange={(value) =>
                            updateForm({ ntfyAuthMethod: value as NtfyNotificationSettings["ntfyAuthMethod"] })
                        }
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select auth method" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="basic">Basic Auth</SelectItem>
                            <SelectItem value="access_token">Access Token</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Username (Basic Auth) */}
                {form.ntfyAuthMethod === "basic" && (
                    <>
                        <div className="form-row">
                            <label htmlFor="username" className="block text-sm font-medium mb-2">
                                Username
                            </label>
                            <input
                                type="text"
                                id="username"
                                value={form.username}
                                onChange={(e) => updateForm({ username: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoComplete="off"
                            />
                        </div>

                        <div className="form-row">
                            <label htmlFor="password" className="block text-sm font-medium mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                id="password"
                                value={form.password}
                                onChange={(e) => updateForm({ password: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoComplete="new-password"
                            />
                        </div>
                    </>
                )}

                {/* Access Token */}
                {form.ntfyAuthMethod === "access_token" && (
                    <div className="form-row">
                        <label htmlFor="accessToken" className="block text-sm font-medium mb-2">
                            Access Token
                        </label>
                        <input
                            type="password"
                            id="accessToken"
                            value={form.accessToken}
                            onChange={(e) => updateForm({ accessToken: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoComplete="off"
                        />
                    </div>
                )}

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
                        onClick={() => router.push("/admin/settings/notifications/ntfy")}
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
