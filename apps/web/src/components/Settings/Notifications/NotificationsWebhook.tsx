"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { NotificationUserSelector } from "./NotificationUserSelector";
import NotificationTypeSelector from "./NotificationTypeSelector";

type WebhookNotificationSettings = {
    name: string;
    enabled: boolean;
    types: number;
    webhookUrl: string;
    authHeader: string;
    jsonPayload: string;
};

const defaultPayload = {
    notification_type: "{{notification_type}}",
    event: "{{event}}",
    subject: "{{subject}}",
    message: "{{message}}",
    image: "{{image}}",
    media: {
        media_type: "{{media_type}}",
        tmdbId: "{{media_tmdbid}}",
        status: "{{media_status}}",
    },
    request: {
        request_id: "{{request_id}}",
        requestedBy_email: "{{requestedBy_email}}",
        requestedBy_username: "{{requestedBy_username}}",
    },
};

const initialState: WebhookNotificationSettings = {
    name: "",
    enabled: false,
    types: 0,
    webhookUrl: "",
    authHeader: "",
    jsonPayload: JSON.stringify(defaultPayload, null, 2),
};

interface NotificationsWebhookProps {
    mode?: "create" | "edit";
    endpointId?: number;
}

export default function NotificationsWebhook({
    mode = "edit",
    endpointId,
}: NotificationsWebhookProps) {
    const router = useRouter();
    const toast = useToast();
    const [form, setForm] = useState<WebhookNotificationSettings>(initialState);
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
        fetch(`/api/v1/admin/notifications/webhook/${endpointId}`, { credentials: "include" })
            .then(async (res) => {
                if (!active) return;
                if (!res.ok) {
                    if (res.status === 404) {
                        toast.error("Notification endpoint not found");
                        router.push("/admin/settings/notifications/webhook");
                        return;
                    }
                    if (res.status === 401 || res.status === 403) {
                        toast.error("You must be an admin to view notification settings");
                        return;
                    }
                    throw new Error("Failed to load webhook notification settings");
                }
                const data = await res.json();
                setForm({
                    name: data.name ?? "",
                    enabled: data.enabled ?? false,
                    types: data.types ?? 0,
                    webhookUrl: data.config?.webhookUrl ?? "",
                    authHeader: data.config?.authHeader ?? "",
                    jsonPayload: data.config?.jsonPayload
                        ? JSON.stringify(JSON.parse(data.config.jsonPayload), null, 2)
                        : JSON.stringify(defaultPayload, null, 2),
                });
            })
            .catch(() => {
                toast.error("Unable to load webhook notification settings");
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mode, endpointId, toast, router]);

    const updateForm = (patch: Partial<WebhookNotificationSettings>) => {
        setForm((prev) => ({ ...prev, ...patch }));
    };

    const resetPayload = () => {
        updateForm({ jsonPayload: JSON.stringify(defaultPayload, null, 2) });
        toast.info("JSON payload reset to default");
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!form.name.trim()) {
            toast.error("Name is required");
            return;
        }

        if (form.enabled && !form.webhookUrl.trim()) {
            toast.error("Webhook URL is required when agent is enabled");
            return;
        }

        if (form.enabled && !form.types) {
            toast.error("You must select at least one notification type");
            return;
        }

        // Validate JSON payload
        try {
            JSON.parse(form.jsonPayload);
        } catch (e) {
            toast.error("Invalid JSON payload");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                enabled: form.enabled,
                types: form.types,
                config: {
                    webhookUrl: form.webhookUrl.trim(),
                    authHeader: form.authHeader.trim(),
                    jsonPayload: form.jsonPayload,
                },
            };

            let res;
            if (mode === "create") {
                res = await csrfFetch("/api/v1/admin/notifications/webhook/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            } else {
                res = await csrfFetch(`/api/v1/admin/notifications/webhook/${endpointId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save webhook notification settings");
            }

            toast.success(
                mode === "create"
                    ? "Webhook notification created successfully!"
                    : "Webhook notification settings saved successfully!"
            );
            router.push("/admin/settings/notifications/webhook");
        } catch (error: any) {
            toast.error(error.message || "Failed to save webhook notification settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await csrfFetch("/api/v1/admin/notifications/webhook/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    enabled: true,
                    types: form.types,
                    config: {
                        webhookUrl: form.webhookUrl.trim(),
                        authHeader: form.authHeader.trim(),
                        jsonPayload: form.jsonPayload,
                    },
                }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to send test notification");
            }

            toast.success("Test webhook notification sent successfully!");
        } catch (error: any) {
            toast.error(error.message || "Failed to send test webhook notification");
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div className="p-4">Loading webhook notification settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">
                    {mode === "create" ? "Create Webhook Notification" : "Edit Webhook Notification"}
                </h2>
                <p className="text-gray-400">Configure custom webhook notifications with JSON payload</p>
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
                        placeholder="e.g., Main Webhook, Custom Integration, etc."
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

                {/* Webhook URL */}
                <div className="form-row">
                    <label htmlFor="webhookUrl" className="block text-sm font-medium mb-2">
                        Webhook URL
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="url"
                        id="webhookUrl"
                        value={form.webhookUrl}
                        onChange={(e) => updateForm({ webhookUrl: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://example.com/webhook"
                        required={form.enabled}
                    />
                </div>

                {/* Authorization Header */}
                <div className="form-row">
                    <label htmlFor="authHeader" className="block text-sm font-medium mb-2">
                        Authorization Header
                    </label>
                    <input
                        type="password"
                        id="authHeader"
                        value={form.authHeader}
                        onChange={(e) => updateForm({ authHeader: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Bearer token123..."
                        autoComplete="off"
                    />
                </div>

                {/* JSON Payload */}
                <div className="form-row">
                    <div className="flex items-center justify-between mb-2">
                        <label htmlFor="jsonPayload" className="text-sm font-medium">
                            JSON Payload
                            {form.enabled && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <button
                            type="button"
                            onClick={resetPayload}
                            className="text-sm text-blue-400 hover:underline"
                        >
                            Reset to Default
                        </button>
                    </div>
                    <textarea
                        id="jsonPayload"
                        value={form.jsonPayload}
                        onChange={(e) => updateForm({ jsonPayload: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        rows={15}
                        required={form.enabled}
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        Use template variables like {`{{notification_type}}`}, {`{{subject}}`}, {`{{message}}`}
                    </p>
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
                        onClick={() => router.push("/admin/settings/notifications/webhook")}
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
