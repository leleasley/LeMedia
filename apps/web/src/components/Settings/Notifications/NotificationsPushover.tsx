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

type PushoverNotificationSettings = {
    name: string;
    enabled: boolean;
    types: number;
    userToken: string;
    apiToken: string;
    priority: number;
    sound: string;
};

const initialState: PushoverNotificationSettings = {
    name: "",
    enabled: false,
    types: 0,
    userToken: "",
    apiToken: "",
    priority: 0,
    sound: "pushover",
};

interface NotificationsPushoverProps {
    mode?: "create" | "edit";
    endpointId?: number;
}

export default function NotificationsPushover({
    mode = "edit",
    endpointId,
}: NotificationsPushoverProps) {
    const router = useRouter();
    const toast = useToast();
    const [form, setForm] = useState<PushoverNotificationSettings>(initialState);
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
        fetch(`/api/v1/admin/notifications/pushover/${endpointId}`, { credentials: "include" })
            .then(async (res) => {
                if (!active) return;
                if (!res.ok) {
                    if (res.status === 404) {
                        toast.error("Notification endpoint not found");
                        router.push("/admin/settings/notifications/pushover");
                        return;
                    }
                    if (res.status === 401 || res.status === 403) {
                        toast.error("You must be an admin to view notification settings");
                        return;
                    }
                    throw new Error("Failed to load Pushover notification settings");
                }
                const data = await res.json();
                setForm({
                    name: data.name ?? "",
                    enabled: data.enabled ?? false,
                    types: data.types ?? 0,
                    userToken: "",
                    apiToken: "",
                    priority: data.config?.priority ?? 0,
                    sound: data.config?.sound ?? "pushover",
                });
            })
            .catch(() => {
                toast.error("Unable to load Pushover notification settings");
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mode, endpointId, toast, router]);

    const updateForm = (patch: Partial<PushoverNotificationSettings>) => {
        setForm((prev) => ({ ...prev, ...patch }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!form.name.trim()) {
            toast.error("Name is required");
            return;
        }

        if (form.enabled && !form.userToken.trim()) {
            toast.error("User token is required when agent is enabled");
            return;
        }

        if (form.enabled && !form.apiToken.trim()) {
            toast.error("API token is required when agent is enabled");
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
                    userToken: form.userToken.trim(),
                    apiToken: form.apiToken.trim(),
                    priority: form.priority,
                    sound: form.sound,
                },
            };

            let res;
            if (mode === "create") {
                res = await csrfFetch("/api/v1/admin/notifications/pushover/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            } else {
                res = await csrfFetch(`/api/v1/admin/notifications/pushover/${endpointId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save Pushover notification settings");
            }

            toast.success(
                mode === "create"
                    ? "Pushover notification created successfully!"
                    : "Pushover notification settings saved successfully!"
            );
            router.push("/admin/settings/notifications/pushover");
        } catch (error: any) {
            toast.error(error.message || "Failed to save Pushover notification settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await csrfFetch("/api/v1/admin/notifications/pushover/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    enabled: true,
                    types: form.types,
                    config: {
                        userToken: form.userToken.trim(),
                        apiToken: form.apiToken.trim(),
                        priority: form.priority,
                        sound: form.sound,
                    },
                }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to send test notification");
            }

            toast.success("Test Pushover notification sent successfully!");
        } catch (error: any) {
            toast.error(error.message || "Failed to send test Pushover notification");
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div className="p-4">Loading Pushover notification settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">
                    {mode === "create" ? "Create Pushover Notification" : "Edit Pushover Notification"}
                </h2>
                <p className="text-gray-400">Configure Pushover push notifications</p>
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
                        placeholder="e.g., Main Pushover, Personal Devices, etc."
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

                {/* User Token */}
                <div className="form-row">
                    <label htmlFor="userToken" className="block text-sm font-medium mb-2">
                        User Key
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="password"
                        id="userToken"
                        value={form.userToken}
                        onChange={(e) => updateForm({ userToken: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="uQiRzpo4DXghDmr9QzzfQu27cmVRsG"
                        required={form.enabled}
                        autoComplete="off"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        Your user key from{" "}
                        <a
                            href="https://pushover.net/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            Pushover
                        </a>
                    </p>
                </div>

                {/* API Token */}
                <div className="form-row">
                    <label htmlFor="apiToken" className="block text-sm font-medium mb-2">
                        API Token
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="password"
                        id="apiToken"
                        value={form.apiToken}
                        onChange={(e) => updateForm({ apiToken: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="azGDORePK8gMaC0QOYAMyEEuzJnyUi"
                        required={form.enabled}
                        autoComplete="off"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                        Create an application in your{" "}
                        <a
                            href="https://pushover.net/apps/build"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            Pushover account
                        </a>
                    </p>
                </div>

                {/* Priority */}
                <div className="form-row">
                    <label htmlFor="priority" className="block text-sm font-medium mb-2">
                        Priority
                    </label>
                    <Select
                        value={String(form.priority)}
                        onValueChange={(value) => updateForm({ priority: parseInt(value) })}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="-2">Lowest</SelectItem>
                            <SelectItem value="-1">Low</SelectItem>
                            <SelectItem value="0">Normal</SelectItem>
                            <SelectItem value="1">High</SelectItem>
                            <SelectItem value="2">Emergency</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Sound */}
                <div className="form-row">
                    <label htmlFor="sound" className="block text-sm font-medium mb-2">
                        Notification Sound
                    </label>
                    <Select
                        value={form.sound}
                        onValueChange={(value) => updateForm({ sound: value })}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select sound" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pushover">Pushover (default)</SelectItem>
                            <SelectItem value="bike">Bike</SelectItem>
                            <SelectItem value="bugle">Bugle</SelectItem>
                            <SelectItem value="cashregister">Cash Register</SelectItem>
                            <SelectItem value="classical">Classical</SelectItem>
                            <SelectItem value="cosmic">Cosmic</SelectItem>
                            <SelectItem value="falling">Falling</SelectItem>
                            <SelectItem value="gamelan">Gamelan</SelectItem>
                            <SelectItem value="incoming">Incoming</SelectItem>
                            <SelectItem value="intermission">Intermission</SelectItem>
                            <SelectItem value="magic">Magic</SelectItem>
                            <SelectItem value="mechanical">Mechanical</SelectItem>
                            <SelectItem value="pianobar">Piano Bar</SelectItem>
                            <SelectItem value="siren">Siren</SelectItem>
                            <SelectItem value="spacealarm">Space Alarm</SelectItem>
                            <SelectItem value="tugboat">Tug Boat</SelectItem>
                            <SelectItem value="alien">Alien Alarm (long)</SelectItem>
                            <SelectItem value="climb">Climb (long)</SelectItem>
                            <SelectItem value="persistent">Persistent (long)</SelectItem>
                            <SelectItem value="echo">Pushover Echo (long)</SelectItem>
                            <SelectItem value="updown">Up Down (long)</SelectItem>
                            <SelectItem value="vibrate">Vibrate Only</SelectItem>
                            <SelectItem value="none">None (silent)</SelectItem>
                        </SelectContent>
                    </Select>
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
                        onClick={() => router.push("/admin/settings/notifications/pushover")}
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
