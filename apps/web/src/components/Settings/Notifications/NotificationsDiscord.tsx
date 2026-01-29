"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import NotificationTypeSelector from "./NotificationTypeSelector";
import { NotificationUserSelector } from "./NotificationUserSelector";

type DiscordNotificationSettings = {
    name: string;
    enabled: boolean;
    types: number;
    botUsername: string;
    botAvatarUrl: string;
    webhookUrl: string;
    discordUserId: string;
    enableMentions: boolean;
};

const initialState: DiscordNotificationSettings = {
    name: "",
    enabled: false,
    types: 0,
    botUsername: "",
    botAvatarUrl: "",
    webhookUrl: "",
    discordUserId: "",
    enableMentions: false,
};

interface NotificationsDiscordProps {
    mode?: "create" | "edit";
    endpointId?: number;
}

export default function NotificationsDiscord({
    mode = "edit",
    endpointId,
}: NotificationsDiscordProps) {
    const router = useRouter();
    const toast = useToast();
    const [form, setForm] = useState<DiscordNotificationSettings>(initialState);
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
        fetch(`/api/v1/admin/notifications/discord/${endpointId}`, { credentials: "include" })
            .then(async (res) => {
                if (!active) return;
                if (!res.ok) {
                    if (res.status === 404) {
                        toast.error("Notification endpoint not found");
                        router.push("/admin/settings/notifications/discord");
                        return;
                    }
                    if (res.status === 401 || res.status === 403) {
                        toast.error("You must be an admin to view notification settings");
                        return;
                    }
                    throw new Error("Failed to load Discord notification settings");
                }
                const data = await res.json();
                let config: any = data.config ?? {};
                if (typeof config === "string") {
                    try {
                        config = JSON.parse(config);
                    } catch {
                        config = {};
                    }
                }
                const rawDiscordUserId =
                    config?.discordUserId ??
                    config?.discord_user_id ??
                    config?.userId ??
                    "";
                setForm({
                    name: data.name ?? "",
                    enabled: data.enabled ?? false,
                    types: data.types ?? 0,
                    botUsername: config?.botUsername ?? "",
                    botAvatarUrl: config?.botAvatarUrl ?? "",
                    webhookUrl: config?.webhookUrl ?? "",
                    discordUserId: String(rawDiscordUserId ?? ""),
                    enableMentions: config?.enableMentions ?? false,
                });
            })
            .catch(() => {
                toast.error("Unable to load Discord notification settings");
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mode, endpointId, toast, router]);

    const updateForm = (patch: Partial<DiscordNotificationSettings>) => {
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
                    botUsername: form.botUsername.trim(),
                    botAvatarUrl: form.botAvatarUrl.trim(),
                    webhookUrl: form.webhookUrl.trim(),
                    discordUserId: form.discordUserId.trim(),
                    enableMentions: form.enableMentions,
                },
            };

            let res;
            if (mode === "create") {
                res = await csrfFetch("/api/v1/admin/notifications/discord/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            } else {
                res = await csrfFetch(`/api/v1/admin/notifications/discord/${endpointId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Discord notification settings");
            }

            toast.success(
                mode === "create"
                    ? "Discord notification created successfully!"
                    : "Discord notification settings saved successfully!"
            );
            router.push("/admin/settings/notifications/discord");
        } catch (error: any) {
            toast.error(error.message || "Failed to save Discord notification settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await csrfFetch(`/api/v1/admin/notifications/discord/test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    enabled: true,
                    types: form.types,
                    config: {
                        botUsername: form.botUsername.trim(),
                        botAvatarUrl: form.botAvatarUrl.trim(),
                        webhookUrl: form.webhookUrl.trim(),
                        discordUserId: form.discordUserId.trim(),
                        enableMentions: form.enableMentions,
                    },
                }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to send test notification");
            }

            toast.success("Test Discord notification sent successfully!");
        } catch (error: any) {
            toast.error(error.message || "Failed to send test Discord notification");
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div className="p-4">Loading Discord notification settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">
                    {mode === "create" ? "Create Discord Notification" : "Edit Discord Notification"}
                </h2>
                <p className="text-gray-400">Configure Discord webhook notifications</p>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                <NotificationUserSelector
                    selectedDiscordUserId={form.discordUserId}
                    storageKey="lemedia.notifications.discord.selectedUserId"
                    onUserSelected={(user) => updateForm({ discordUserId: user?.discordUserId ?? "" })}
                />

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
                        placeholder="e.g., Lewis' Discord, Main Server, etc."
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
                        placeholder="https://discord.com/api/webhooks/..."
                        required={form.enabled}
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        Create a{" "}
                        <a
                            href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            webhook integration
                        </a>{" "}
                        in your server
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

                {/* Bot Avatar URL */}
                <div className="form-row">
                    <label htmlFor="botAvatarUrl" className="block text-sm font-medium mb-2">
                        Bot Avatar URL
                    </label>
                    <input
                        type="url"
                        id="botAvatarUrl"
                        value={form.botAvatarUrl}
                        onChange={(e) => updateForm({ botAvatarUrl: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://example.com/avatar.png"
                    />
                </div>

                {/* Discord User ID */}
                <div className="form-row">
                    <label htmlFor="discordUserId" className="block text-sm font-medium mb-2">
                        Discord User ID
                    </label>
                    <input
                        type="text"
                        id="discordUserId"
                        value={form.discordUserId}
                        onChange={(e) => updateForm({ discordUserId: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="123456789012345678"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        Your Discord user ID to mention in the webhook message. Leave empty to disable mentions
                    </p>
                </div>

                {/* Enable Mentions */}
                <div className="form-row">
                    <AnimatedCheckbox
                        id="enableMentions"
                        label="Enable Mentions"
                        description="Mention the specified Discord user in webhook messages"
                        checked={form.enableMentions}
                        onChange={(e) => updateForm({ enableMentions: e.target.checked })}
                    />
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
                        onClick={() => router.push("/admin/settings/notifications/discord")}
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
