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

type EmailNotificationSettings = {
    name: string;
    enabled: boolean;
    types: number;
    userEmailRequired: boolean;
    emailFrom: string;
    smtpHost: string;
    smtpPort: number;
    encryption: "none" | "default" | "opportunistic" | "implicit";
    authUser: string;
    authPass: string;
    allowSelfSigned: boolean;
    senderName: string;
};

const initialState: EmailNotificationSettings = {
    name: "",
    enabled: false,
    types: 0,
    userEmailRequired: false,
    emailFrom: "",
    smtpHost: "",
    smtpPort: 587,
    encryption: "default",
    authUser: "",
    authPass: "",
    allowSelfSigned: false,
    senderName: "",
};

interface NotificationsEmailProps {
    mode?: "create" | "edit";
    endpointId?: number;
}

export default function NotificationsEmail({
    mode = "edit",
    endpointId,
}: NotificationsEmailProps) {
    const router = useRouter();
    const toast = useToast();
    const [form, setForm] = useState<EmailNotificationSettings>(initialState);
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
        fetch(`/api/v1/admin/notifications/email/${endpointId}`, { credentials: "include" })
            .then(async (res) => {
                if (!active) return;
                if (!res.ok) {
                    if (res.status === 404) {
                        toast.error("Notification endpoint not found");
                        router.push("/admin/settings/notifications/email");
                        return;
                    }
                    if (res.status === 401 || res.status === 403) {
                        toast.error("You must be an admin to view notification settings");
                        return;
                    }
                    throw new Error("Failed to load email notification settings");
                }
                const data = await res.json();
                setForm({
                    name: data.name ?? "",
                    enabled: data.enabled ?? false,
                    types: data.types ?? 0,
                    userEmailRequired: data.config?.userEmailRequired ?? false,
                    emailFrom: data.config?.emailFrom ?? "",
                    smtpHost: data.config?.smtpHost ?? "",
                    smtpPort: data.config?.smtpPort ?? 587,
                    encryption: data.config?.secure
                        ? "implicit"
                        : data.config?.requireTls
                            ? "opportunistic"
                            : data.config?.ignoreTls
                                ? "none"
                                : "default",
                    authUser: data.config?.authUser ?? "",
                    authPass: "",
                    allowSelfSigned: data.config?.allowSelfSigned ?? false,
                    senderName: data.config?.senderName ?? "",
                });
            })
            .catch(() => {
                toast.error("Unable to load email notification settings");
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mode, endpointId, toast, router]);

    const updateForm = (patch: Partial<EmailNotificationSettings>) => {
        setForm((prev) => ({ ...prev, ...patch }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!form.name.trim()) {
            toast.error("Name is required");
            return;
        }

        if (form.enabled && !form.emailFrom.trim()) {
            toast.error("Sender address is required when agent is enabled");
            return;
        }

        if (form.enabled && !form.smtpHost.trim()) {
            toast.error("SMTP host is required when agent is enabled");
            return;
        }

        if (form.enabled && (!form.smtpPort || form.smtpPort <= 0)) {
            toast.error("SMTP port must be a valid number");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                enabled: form.enabled,
                types: 0,
                config: {
                    userEmailRequired: form.userEmailRequired,
                    emailFrom: form.emailFrom.trim(),
                    smtpHost: form.smtpHost.trim(),
                    smtpPort: Number(form.smtpPort),
                    secure: form.encryption === "implicit",
                    ignoreTls: form.encryption === "none",
                    requireTls: form.encryption === "opportunistic",
                    authUser: form.authUser.trim(),
                    authPass: form.authPass.trim(),
                    allowSelfSigned: form.allowSelfSigned,
                    senderName: form.senderName.trim(),
                },
            };

            let res;
            if (mode === "create") {
                res = await csrfFetch("/api/v1/admin/notifications/email/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            } else {
                res = await csrfFetch(`/api/v1/admin/notifications/email/${endpointId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save email notification settings");
            }

            toast.success(
                mode === "create"
                    ? "Email notification created successfully!"
                    : "Email notification settings saved successfully!"
            );
            router.push("/admin/settings/notifications/email");
        } catch (error: any) {
            toast.error(error.message || "Failed to save email notification settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await csrfFetch("/api/v1/admin/notifications/email/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    enabled: true,
                    types: form.types,
                    config: {
                        userEmailRequired: form.userEmailRequired,
                        emailFrom: form.emailFrom.trim(),
                        smtpHost: form.smtpHost.trim(),
                        smtpPort: Number(form.smtpPort),
                        secure: form.encryption === "implicit",
                        ignoreTls: form.encryption === "none",
                        requireTls: form.encryption === "opportunistic",
                        authUser: form.authUser.trim(),
                        authPass: form.authPass.trim(),
                        allowSelfSigned: form.allowSelfSigned,
                        senderName: form.senderName.trim(),
                    },
                }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to send test notification");
            }

            toast.success("Test email notification sent successfully!");
        } catch (error: any) {
            toast.error(error.message || "Failed to send test email notification");
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div className="p-4">Loading email notification settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">
                    {mode === "create" ? "Create Email Notification" : "Edit Email Notification"}
                </h2>
                <p className="text-gray-400">Configure email notifications via SMTP</p>
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
                        placeholder="e.g., Main Email Server, etc."
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

                {/* User Email Required */}
                <div className="form-row">
                    <AnimatedCheckbox
                        id="userEmailRequired"
                        label="Require User Email"
                        description="Only send notifications to users with registered email addresses"
                        checked={form.userEmailRequired}
                        onChange={(e) => updateForm({ userEmailRequired: e.target.checked })}
                    />
                </div>

                {/* Sender Name */}
                <div className="form-row">
                    <label htmlFor="senderName" className="block text-sm font-medium mb-2">
                        Sender Name
                    </label>
                    <input
                        type="text"
                        id="senderName"
                        value={form.senderName}
                        onChange={(e) => updateForm({ senderName: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="LeMedia"
                    />
                </div>

                {/* Sender Address */}
                <div className="form-row">
                    <label htmlFor="emailFrom" className="block text-sm font-medium mb-2">
                        Sender Address
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="email"
                        id="emailFrom"
                        value={form.emailFrom}
                        onChange={(e) => updateForm({ emailFrom: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="noreply@lemedia.app"
                        required={form.enabled}
                    />
                </div>

                {/* SMTP Host */}
                <div className="form-row">
                    <label htmlFor="smtpHost" className="block text-sm font-medium mb-2">
                        SMTP Host
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="text"
                        id="smtpHost"
                        value={form.smtpHost}
                        onChange={(e) => updateForm({ smtpHost: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="smtp.example.com"
                        required={form.enabled}
                    />
                </div>

                {/* SMTP Port */}
                <div className="form-row">
                    <label htmlFor="smtpPort" className="block text-sm font-medium mb-2">
                        SMTP Port
                        {form.enabled && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                        type="number"
                        id="smtpPort"
                        value={form.smtpPort}
                        onChange={(e) => updateForm({ smtpPort: parseInt(e.target.value) || 587 })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="587"
                        min="1"
                        max="65535"
                        required={form.enabled}
                    />
                </div>

                {/* Encryption Method */}
                <div className="form-row">
                    <label htmlFor="encryption" className="block text-sm font-medium mb-2">
                        Encryption Method
                    </label>
                    <Select
                        value={form.encryption}
                        onValueChange={(value) =>
                            updateForm({ encryption: value as EmailNotificationSettings["encryption"] })
                        }
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select encryption" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="default">Use STARTTLS if available</SelectItem>
                            <SelectItem value="opportunistic">Always use STARTTLS</SelectItem>
                            <SelectItem value="implicit">Use Implicit TLS</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-gray-400 mt-1">
                        In most cases, Implicit TLS uses port 465 and STARTTLS uses port 587
                    </p>
                </div>

                {/* SMTP Username */}
                <div className="form-row">
                    <label htmlFor="authUser" className="block text-sm font-medium mb-2">
                        SMTP Username
                    </label>
                    <input
                        type="text"
                        id="authUser"
                        value={form.authUser}
                        onChange={(e) => updateForm({ authUser: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoComplete="off"
                    />
                </div>

                {/* SMTP Password */}
                <div className="form-row">
                    <label htmlFor="authPass" className="block text-sm font-medium mb-2">
                        SMTP Password
                    </label>
                    <input
                        type="password"
                        id="authPass"
                        value={form.authPass}
                        onChange={(e) => updateForm({ authPass: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoComplete="new-password"
                    />
                </div>

                {/* Allow Self-Signed Certificates */}
                <div className="form-row">
                    <AnimatedCheckbox
                        id="allowSelfSigned"
                        label="Allow Self-Signed Certificates"
                        description="Enable if your SMTP server uses self-signed SSL/TLS certificates"
                        checked={form.allowSelfSigned}
                        onChange={(e) => updateForm({ allowSelfSigned: e.target.checked })}
                    />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={() => router.push("/admin/settings/notifications/email")}
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
                        disabled={saving || testing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Saving..." : mode === "create" ? "Create" : "Save Changes"}
                    </button>
                </div>
            </form>
        </div>
    );
}
