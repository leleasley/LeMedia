"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { NotificationUserSelector } from "./NotificationUserSelector";
import NotificationTypeSelector from "./NotificationTypeSelector";

type TelegramNotificationSettings = {
    name: string;
    enabled: boolean;
    types: number;
    botUsername: string;
    botAPI: string;
    chatId: string;
    messageThreadId: string;
    sendSilently: boolean;
};

const initialState: TelegramNotificationSettings = {
    name: "",
    enabled: false,
    types: 0,
    botUsername: "",
    botAPI: "",
    chatId: "",
    messageThreadId: "",
    sendSilently: false,
};

interface NotificationsTelegramProps {
    mode?: "create" | "edit";
    endpointId?: number;
}

export default function NotificationsTelegram({
    mode = "edit",
    endpointId,
}: NotificationsTelegramProps) {
    const router = useRouter();
    const toast = useToast();
    const [form, setForm] = useState<TelegramNotificationSettings>(initialState);
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
        fetch(`/api/v1/admin/notifications/telegram/${endpointId}`, { credentials: "include" })
            .then(async (res) => {
                if (!active) return;
                if (!res.ok) {
                    if (res.status === 404) {
                        toast.error("Notification endpoint not found");
                        router.push("/admin/settings/notifications/telegram");
                        return;
                    }
                    if (res.status === 401 || res.status === 403) {
                        toast.error("You must be an admin to view notification settings");
                        return;
                    }
                    throw new Error("Failed to load Telegram notification settings");
                }
                const data = await res.json();
                setForm({
                    name: data.name ?? "",
                    enabled: data.enabled ?? false,
                    types: data.types ?? 0,
                    botUsername: data.config?.botUsername ?? "",
                    botAPI: data.config?.botAPI ?? "",
                    chatId: data.config?.chatId ?? "",
                    messageThreadId: data.config?.messageThreadId ?? "",
                    sendSilently: data.config?.sendSilently ?? false,
                });
            })
            .catch(() => {
                toast.error("Unable to load Telegram notification settings");
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mode, endpointId, toast, router]);

    const updateForm = (patch: Partial<TelegramNotificationSettings>) => {
        setForm((prev) => ({ ...prev, ...patch }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!form.name.trim()) {
            toast.error("Name is required");
            return;
        }

        if (form.enabled && !form.botAPI.trim()) {
            toast.error("Bot authorization token is required when agent is enabled");
            return;
        }

        if (form.enabled && form.types && !form.chatId.trim()) {
            toast.error("Chat ID is required when notification types are selected");
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
                    botAPI: form.botAPI.trim(),
                    chatId: form.chatId.trim(),
                    messageThreadId: form.messageThreadId.trim(),
                    sendSilently: form.sendSilently,
                    botUsername: form.botUsername.trim(),
                },
            };

            let res;
            if (mode === "create") {
                res = await csrfFetch("/api/v1/admin/notifications/telegram/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            } else {
                res = await csrfFetch(`/api/v1/admin/notifications/telegram/${endpointId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Telegram notification settings");
            }

            toast.success(
                mode === "create"
                    ? "Telegram notification created successfully!"
                    : "Telegram notification settings saved successfully!"
            );
            router.push("/admin/settings/notifications/telegram");
        } catch (error: any) {
            toast.error(error.message || "Failed to save Telegram notification settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await csrfFetch("/api/v1/admin/notifications/telegram/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    enabled: true,
                    types: form.types,
                    config: {
                        botAPI: form.botAPI.trim(),
                        chatId: form.chatId.trim(),
                        messageThreadId: form.messageThreadId.trim(),
                        sendSilently: form.sendSilently,
                        botUsername: form.botUsername.trim(),
                    },
                }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to send test notification");
            }

            toast.success("Test Telegram notification sent successfully!");
        } catch (error: any) {
            toast.error(error.message || "Failed to send test Telegram notification");
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div className="p-4">Loading Telegram notification settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">
                    {mode === "create" ? "Create Telegram Notification" : "Edit Telegram Notification"}
                </h2>
                <p className="text-gray-400">Configure Telegram bot notifications</p>
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
                        placeholder="e.g., Main Telegram, Family Group, etc."
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

                {/* Bot Authorization Token */}
                <div className="form-row">
                    <label htmlFor="botAPI" className="block text-sm font-medium mb-2">
                        Bot Authorization Token
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="password"
                        id="botAPI"
                        value={form.botAPI}
                        onChange={(e) => updateForm({ botAPI: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                        required={form.enabled}
                        autoComplete="off"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        <a
                            href="https://core.telegram.org/bots#6-botfather"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            Create a bot
                        </a>{" "}
                        for use with LeMedia
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
                        placeholder="lemedia_bot"
                        autoComplete="off"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        Allow users to also start a chat with your bot and configure their own notifications
                    </p>
                </div>

                {/* Chat ID */}
                <div className="form-row">
                    <label htmlFor="chatId" className="block text-sm font-medium mb-2">
                        Chat ID
                        {form.enabled && form.types > 0 && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="text"
                        id="chatId"
                        value={form.chatId}
                        onChange={(e) => updateForm({ chatId: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="-1001234567890"
                        autoComplete="off"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        Start a chat with your bot, add{" "}
                        <a
                            href="https://telegram.me/get_id_bot"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            @get_id_bot
                        </a>
                        , and issue the <code className="bg-gray-700 px-1 rounded">/my_id</code> command
                    </p>
                </div>

                {/* Message Thread ID */}
                <div className="form-row">
                    <label htmlFor="messageThreadId" className="block text-sm font-medium mb-2">
                        Thread/Topic ID
                    </label>
                    <input
                        type="text"
                        id="messageThreadId"
                        value={form.messageThreadId}
                        onChange={(e) => updateForm({ messageThreadId: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="123"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        If your group-chat has topics enabled, you can specify a thread/topic&apos;s ID here
                    </p>
                </div>

                {/* Send Silently */}
                <div className="form-row">
                    <AnimatedCheckbox
                        id="sendSilently"
                        label="Send Silently"
                        description="Send notifications with no sound"
                        checked={form.sendSilently}
                        onChange={(e) => updateForm({ sendSilently: e.target.checked })}
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
                        onClick={() => router.push("/admin/settings/notifications/telegram")}
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
