"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { NotificationUserSelector } from "./NotificationUserSelector";
import NotificationTypeSelector from "./NotificationTypeSelector";

type SlackNotificationSettings = {
    name: string;
    enabled: boolean;
    types: number;
    webhookUrl: string;
    botUsername: string;
    botEmoji: string;
};

const initialState: SlackNotificationSettings = {
    name: "",
    enabled: false,
    types: 0,
    webhookUrl: "",
    botUsername: "",
    botEmoji: ":robot_face:",
};

interface NotificationsSlackProps {
    mode?: "create" | "edit";
    endpointId?: number;
}

export default function NotificationsSlack({
    mode = "edit",
    endpointId,
}: NotificationsSlackProps) {
    const router = useRouter();
    const toast = useToast();
    const [form, setForm] = useState<SlackNotificationSettings>(initialState);
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
        fetch(`/api/v1/admin/notifications/slack/${endpointId}`, { credentials: "include" })
            .then(async (res) => {
                if (!active) return;
                if (!res.ok) {
                    if (res.status === 404) {
                        toast.error("Notification endpoint not found");
                        router.push("/admin/settings/notifications/slack");
                        return;
                    }
                    if (res.status === 401 || res.status === 403) {
                        toast.error("You must be an admin to view notification settings");
                        return;
                    }
                    throw new Error("Failed to load Slack notification settings");
                }
                const data = await res.json();
                setForm({
                    name: data.name ?? "",
                    enabled: data.enabled ?? false,
                    types: data.types ?? 0,
                    webhookUrl: data.config?.webhookUrl ?? "",
                    botUsername: data.config?.botUsername ?? "",
                    botEmoji: data.config?.botEmoji ?? ":robot_face:",
                });
            })
            .catch(() => {
                toast.error("Unable to load Slack notification settings");
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mode, endpointId, toast, router]);

    const updateForm = (patch: Partial<SlackNotificationSettings>) => {
        setForm((prev) => ({ ...prev, ...patch }));
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

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                enabled: form.enabled,
                types: form.types,
                config: {
                    webhookUrl: form.webhookUrl.trim(),
                    botUsername: form.botUsername.trim(),
                    botEmoji: form.botEmoji.trim(),
                },
            };

            let res;
            if (mode === "create") {
                res = await csrfFetch("/api/v1/admin/notifications/slack/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            } else {
                res = await csrfFetch(`/api/v1/admin/notifications/slack/${endpointId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Slack notification settings");
            }

            toast.success(
                mode === "create"
                    ? "Slack notification created successfully!"
                    : "Slack notification settings saved successfully!"
            );
            router.push("/admin/settings/notifications/slack");
        } catch (error: any) {
            toast.error(error.message || "Failed to save Slack notification settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await csrfFetch("/api/v1/admin/notifications/slack/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    enabled: true,
                    types: form.types,
                    config: {
                        webhookUrl: form.webhookUrl.trim(),
                        botUsername: form.botUsername.trim(),
                        botEmoji: form.botEmoji.trim(),
                    },
                }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to send test notification");
            }

            toast.success("Test Slack notification sent successfully!");
        } catch (error: any) {
            toast.error(error.message || "Failed to send test Slack notification");
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div className="p-4">Loading Slack notification settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">
                    {mode === "create" ? "Create Slack Notification" : "Edit Slack Notification"}
                </h2>
                <p className="text-gray-400">Configure Slack webhook notifications</p>
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
                        placeholder="e.g., Main Slack, Team Channel, etc."
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
                        placeholder="https://hooks.slack.com/services/..."
                        required={form.enabled}
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        Create an{" "}
                        <a
                            href="https://api.slack.com/messaging/webhooks"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            Incoming Webhook
                        </a>{" "}
                        in your Slack workspace
                    </p>
                </div>

                {/* Bot Username */}
                <div className="form-row">
                    <label htmlFor="botUsername" className="block text-sm font-medium mb-2">
                        Bot Username
                    </label>
                    <input
                        type="text"
                        id="botUsername"
                        value={form.botUsername}
                        onChange={(e) => updateForm({ botUsername: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="LeMedia"
                    />
                </div>

                {/* Bot Emoji */}
                <div className="form-row">
                    <label htmlFor="botEmoji" className="block text-sm font-medium mb-2">
                        Bot Emoji
                    </label>
                    <input
                        type="text"
                        id="botEmoji"
                        value={form.botEmoji}
                        onChange={(e) => updateForm({ botEmoji: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder=":robot_face:"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        Use a Slack emoji code like :ghost: or :movie_camera:
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
                        onClick={() => router.push("/admin/settings/notifications/slack")}
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
