"use client";

import { useEffect, useId, useState } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { ConfirmationModal } from "@/components/Common/ConfirmationModal";
import { csrfFetch } from "@/lib/csrf-client";
import { AdaptiveSelect, type AdaptiveSelectOption } from "@/components/ui/adaptive-select";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
});

export function AdminSettingsPanel() {
    const imageProxyId = useId();
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [sessionDays, setSessionDays] = useState<number | "">("");
    const [jobTimezone, setJobTimezone] = useState("");
    const [timezoneOptions, setTimezoneOptions] = useState<string[]>([]);
    const [imageProxyEnabled, setImageProxyEnabled] = useState(true);
    const [otpEnabled, setOtpEnabled] = useState(true);
    const [ssoEnabled, setSsoEnabled] = useState(true);
    const [enforceMfaAdmin, setEnforceMfaAdmin] = useState(false);
    const [enforceMfaAll, setEnforceMfaAll] = useState(false);
    const [savingImageProxy, setSavingImageProxy] = useState(false);
    const [savingAuth, setSavingAuth] = useState(false);
    const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState("");
    const [savingMaintenance, setSavingMaintenance] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [baseUrl, setBaseUrl] = useState<string | null>(null);
    const [apiKeyVisible, setApiKeyVisible] = useState(false);

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        variant?: "danger" | "warning" | "info";
    }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

    const otpId = useId();
    const ssoId = useId();
    const mfaAdminId = useId();
    const mfaAllId = useId();

    const { data: settings, error: settingsError, mutate: mutateSettings, isLoading: settingsLoading } = useSWR("/api/v1/admin/settings", fetcher, {
        revalidateOnFocus: false,
        onError: () => toast.error("Unable to load settings"),
    });

    const { data: maintenanceData, mutate: mutateMaintenance, isLoading: maintenanceLoading } = useSWR("/api/v1/admin/settings/maintenance", fetcher, {
        revalidateOnFocus: false,
        onError: () => toast.error("Unable to load maintenance mode"),
    });

    const { data: apiKeyData, mutate: mutateApiKey, isLoading: apiKeyLoading } = useSWR("/api/v1/admin/settings/api-key", fetcher, {
        revalidateOnFocus: false,
        onError: () => toast.error("Unable to load API key"),
    });

    useEffect(() => {
        if (settings) {
            const seconds = Number(settings.session_max_age) || 0;
            setSessionDays(seconds ? Math.round(seconds / (60 * 60 * 24)) : "");
            if (typeof settings.image_proxy_enabled === "boolean") {
                setImageProxyEnabled(settings.image_proxy_enabled);
            }
            if (typeof settings.otp_enabled === "boolean") {
                setOtpEnabled(settings.otp_enabled);
            }
            if (typeof settings.sso_enabled === "boolean") {
                setSsoEnabled(settings.sso_enabled);
            }
            if (typeof settings.enforce_mfa_admin === "boolean") {
                setEnforceMfaAdmin(settings.enforce_mfa_admin);
            }
            if (typeof settings.enforce_mfa_all === "boolean") {
                setEnforceMfaAll(settings.enforce_mfa_all);
            }
            if (typeof settings.job_timezone === "string") {
                setJobTimezone(settings.job_timezone);
            }
        }
    }, [settings]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const fallbackZones = [
            "UTC",
            "Europe/London",
            "Europe/Dublin",
            "Europe/Paris",
            "Europe/Berlin",
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Los_Angeles",
            "Asia/Dubai",
            "Asia/Kolkata",
            "Asia/Singapore",
            "Asia/Tokyo",
            "Australia/Sydney"
        ];

        const supported = (Intl as any)?.supportedValuesOf?.("timeZone");
        const zones = Array.isArray(supported) && supported.length ? supported : fallbackZones;
        setTimezoneOptions(zones);
    }, []);

    useEffect(() => {
        if (maintenanceData?.state) {
            setMaintenanceEnabled(!!maintenanceData.state.enabled);
            setMaintenanceMessage(maintenanceData.state.message || "");
        }
    }, [maintenanceData]);

    useEffect(() => {
        if (apiKeyData) {
            setApiKey(apiKeyData.apiKey ?? null);
        }
    }, [apiKeyData]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setBaseUrl(window.location.origin);
    }, []);

    async function rotateApiKey() {
        try {
            const res = await csrfFetch("/api/v1/admin/settings/api-key", {
                method: "POST",
                credentials: "include"
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.error || "Failed to rotate API token");
            }
            toast.success(apiKey ? "API token rotated" : "API token generated");
            mutateApiKey();
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to rotate API token");
        }
    }

    async function saveMaintenance() {
        setSavingMaintenance(true);
        try {
            const res = await csrfFetch("/api/v1/admin/settings/maintenance", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    enabled: maintenanceEnabled,
                    message: maintenanceMessage
                }),
                credentials: "include"
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || "Failed to update maintenance mode");
            toast.success(maintenanceEnabled ? "Maintenance mode enabled" : "Maintenance mode disabled");
            mutateMaintenance();
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to update maintenance mode");
        } finally {
            setSavingMaintenance(false);
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (sessionDays === "" || !Number.isFinite(Number(sessionDays)) || Number(sessionDays) <= 0) {
            toast.error("Enter a valid number of days");
            return;
        }
        setSaving(true);
        try {
            const seconds = Math.floor(Number(sessionDays) * 24 * 60 * 60);
            const res = await csrfFetch("/api/v1/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    session_max_age: seconds, 
                    image_proxy_enabled: imageProxyEnabled,
                    otp_enabled: otpEnabled,
                    sso_enabled: ssoEnabled,
                    job_timezone: jobTimezone
                }),
                credentials: "include"
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || "Failed to save settings");
            toast.success("Settings saved");
            mutateSettings(); // Refresh data
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to save settings");
        } finally {
            setSaving(false);
        }
    }

    async function saveAuthSetting(key: "otp" | "sso" | "mfa_admin" | "mfa_all", nextValue: boolean, previousValue: boolean) {
        if (savingAuth) return;
        setSavingAuth(true);
        try {
            const body = 
                key === "otp" ? { otp_enabled: nextValue } : 
                key === "sso" ? { sso_enabled: nextValue } :
                key === "mfa_admin" ? { enforce_mfa_admin: nextValue } :
                { enforce_mfa_all: nextValue };

            const res = await csrfFetch("/api/v1/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                credentials: "include"
            });
            if (!res.ok) throw new Error("Failed to update auth setting");
            
            const label = 
                key === "otp" ? "OTP" : 
                key === "sso" ? "SSO" :
                key === "mfa_admin" ? "Admin MFA Enforcement" : "All Users MFA Enforcement";

            toast.success(`${label} ${nextValue ? "enabled" : "disabled"}`);
            mutateSettings();
        } catch {
            if (key === "otp") setOtpEnabled(previousValue);
            else if (key === "sso") setSsoEnabled(previousValue);
            else if (key === "mfa_admin") setEnforceMfaAdmin(previousValue);
            else setEnforceMfaAll(previousValue);
            toast.error(`Unable to update setting`);
        } finally {
            setSavingAuth(false);
        }
    }

    async function saveImageProxy(nextValue: boolean, previousValue: boolean) {
        if (savingImageProxy) return;
        setSavingImageProxy(true);
        try {
            const res = await csrfFetch("/api/v1/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_proxy_enabled: nextValue }),
                credentials: "include"
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || "Failed to update image proxy");
            if (typeof window !== "undefined") {
                (window as unknown as { __LEMEDIA_IMAGE_PROXY_ENABLED__?: boolean })
                    .__LEMEDIA_IMAGE_PROXY_ENABLED__ = nextValue;
            }
            toast.success("Image proxy updated");
            mutateSettings();
        } catch (err: any) {
            setImageProxyEnabled(previousValue);
            toast.error(err?.message ?? "Unable to update image proxy");
        } finally {
            setSavingImageProxy(false);
        }
    }

    return (
        <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">General</p>
                    <h2 className="text-xl font-semibold text-white">Application settings</h2>
                    <p className="text-sm text-muted">Control session behavior and secure secrets for the whole app.</p>
                </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
                <div className="rounded-md border border-white/10 bg-slate-900/60 p-4 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="text-sm font-semibold text-white">Maintenance mode</div>
                            <p className="text-xs text-muted">
                                Temporarily block new requests while Radarr/Sonarr are offline or being upgraded.
                            </p>
                        </div>
                        <AnimatedCheckbox
                            id="maintenance-enabled"
                            checked={maintenanceEnabled}
                            onChange={e => setMaintenanceEnabled(e.target.checked)}
                            disabled={maintenanceLoading || savingMaintenance}
                            label={maintenanceEnabled ? "Enabled" : "Disabled"}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-white/80">Message (optional)</label>
                        <textarea
                            className="w-full rounded-md border border-white/10 bg-slate-950/60 p-3 text-sm text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                            rows={2}
                            value={maintenanceMessage}
                            onChange={e => setMaintenanceMessage(e.target.value)}
                            placeholder="e.g. Maintenance window while Sonarr upgrades."
                            disabled={!maintenanceEnabled || maintenanceLoading || savingMaintenance}
                        />
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={saveMaintenance}
                            className="btn"
                            disabled={savingMaintenance || maintenanceLoading}
                        >
                            {savingMaintenance ? "Saving…" : "Save maintenance mode"}
                        </button>
                    </div>
                </div>

                <div>
                    <label className="text-sm font-semibold text-white">Session duration (days)</label>
                    <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-center">
                        <input
                            type="number"
                            min={1}
                            value={sessionDays}
                            onChange={e => setSessionDays(e.target.value === "" ? "" : Number(e.target.value))}
                            className="w-full sm:w-32 input"
                            disabled={settingsLoading}
                        />
                        <button className="btn w-full sm:w-auto" type="submit" disabled={saving || settingsLoading}>
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                <p className="text-xs text-muted mt-1">Set how long users remain signed in by default.</p>
                    {!settingsLoading && sessionDays === "" ? (
                        <p className="mt-2 text-xs text-destructive">Unable to load current value or you are not authorized.</p>
                    ) : null}
                </div>

                <div>
                    <label className="text-sm font-semibold text-white">Job schedule timezone</label>
                    <div className="mt-2">
                        <AdaptiveSelect
                            value={jobTimezone || "__system__"}
                            onValueChange={(value) => setJobTimezone(value === "__system__" ? "" : value)}
                            disabled={settingsLoading}
                            options={[
                                { value: "__system__", label: "System default (server timezone)" },
                                ...(jobTimezone && !timezoneOptions.includes(jobTimezone)
                                    ? [{ value: jobTimezone, label: jobTimezone } as AdaptiveSelectOption]
                                    : []),
                                ...timezoneOptions.map((zone) => ({ value: zone, label: zone }))
                            ]}
                            className="w-full max-w-md"
                        />
                    </div>
                    <p className="text-xs text-muted mt-1">Controls cron-based jobs like the weekly digest schedule.</p>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-4">
                    <div>
                        <label className="text-sm font-semibold text-white">Authentication</label>
                        <p className="mt-1 text-xs text-muted">
                            Control which authentication methods are available to users. Passkeys are always enabled if supported by the device.
                        </p>
                    </div>
                    
                    <div className="space-y-2">
                        <AnimatedCheckbox
                            id={otpId}
                            label="Enable Authenticator App (OTP)"
                            checked={otpEnabled}
                            onChange={e => {
                                const nextValue = e.target.checked;
                                const previousValue = otpEnabled;
                                setOtpEnabled(nextValue);
                                void saveAuthSetting("otp", nextValue, previousValue);
                            }}
                            disabled={settingsLoading || savingAuth}
                        />
                        <AnimatedCheckbox
                            id={ssoId}
                            label="Enable SSO Login"
                            checked={ssoEnabled}
                            onChange={e => {
                                const nextValue = e.target.checked;
                                const previousValue = ssoEnabled;
                                setSsoEnabled(nextValue);
                                void saveAuthSetting("sso", nextValue, previousValue);
                            }}
                            disabled={settingsLoading || savingAuth}
                        />
                        <AnimatedCheckbox
                            id={mfaAdminId}
                            label="Enforce MFA for Admins"
                            description="Require administrators to configure MFA before accessing the dashboard."
                            checked={enforceMfaAdmin}
                            onChange={e => {
                                const nextValue = e.target.checked;
                                const previousValue = enforceMfaAdmin;
                                setEnforceMfaAdmin(nextValue);
                                void saveAuthSetting("mfa_admin", nextValue, previousValue);
                            }}
                            disabled={settingsLoading || savingAuth}
                        />
                        <AnimatedCheckbox
                            id={mfaAllId}
                            label="Enforce MFA for All Users"
                            description="Require all users to configure MFA before accessing the app."
                            checked={enforceMfaAll}
                            onChange={e => {
                                const nextValue = e.target.checked;
                                const previousValue = enforceMfaAll;
                                setEnforceMfaAll(nextValue);
                                void saveAuthSetting("mfa_all", nextValue, previousValue);
                            }}
                            disabled={settingsLoading || savingAuth}
                        />
                    </div>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-2">
                    <div>
                        <label className="text-sm font-semibold text-white">Use image proxy cache</label>
                        <p className="mt-1 text-xs text-muted">
                            When enabled, TMDB images are served through the local proxy cache. Disable to load directly from TMDB.
                        </p>
                    </div>
                    <AnimatedCheckbox
                        id={imageProxyId}
                        label="Enable proxy caching"
                        checked={imageProxyEnabled}
                        onChange={e => {
                            const nextValue = e.target.checked;
                            const previousValue = imageProxyEnabled;
                            setImageProxyEnabled(nextValue);
                            void saveImageProxy(nextValue, previousValue);
                        }}
                        disabled={settingsLoading || savingImageProxy}
                    />
                    <p className="text-xs text-muted">
                        {savingImageProxy ? "Saving…" : "Auto-saves when toggled"}
                    </p>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-3">
                    <div>
                        <label className="text-sm font-semibold text-white">Global API token</label>
                        <p className="mt-1 text-xs text-muted">
                            Use this for server-wide integrations (Jellyfin/Jellyseerr). Treat it like a password.
                        </p>
                    </div>
                    <div className="space-y-2">
                        {apiKey ? (
                            <div className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded overflow-hidden">
                                <code className="text-sm text-white break-all block overflow-wrap-anywhere" style={{ wordBreak: 'break-all' }}>
                                    {apiKeyVisible ? apiKey : apiKey.replace(/./g, '•')}
                                </code>
                            </div>
                        ) : (
                            <div className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded text-muted italic text-sm">
                                {apiKeyLoading ? "Loading…" : "Generate a key to enable"}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="btn flex-1 sm:flex-none"
                                onClick={() => setApiKeyVisible(prev => !prev)}
                                disabled={!apiKey}
                            >
                                {apiKeyVisible ? "Hide" : "Reveal"}
                            </button>
                            <button
                                type="button"
                                className="btn flex-1 sm:flex-none"
                                onClick={async () => {
                                    if (!apiKey) return;
                                    try {
                                        await navigator.clipboard.writeText(apiKey);
                                        toast.success("API token copied");
                                    } catch {
                                        toast.error("Failed to copy API token");
                                    }
                                }}
                                disabled={!apiKey}
                            >
                                Copy
                            </button>
                            <button
                                type="button"
                                className="btn flex-1 sm:flex-none"
                                disabled={apiKeyLoading || saving}
                                onClick={() => {
                                    if (!apiKey) {
                                        // Generate new key immediately (no confirm needed if none exists)
                                        void rotateApiKey();
                                        return;
                                    }
                                    setModalConfig({
                                        isOpen: true,
                                        title: "Rotate API Key?",
                                        message: "Existing integrations using the current key will stop working immediately. You will need to update them with the new key.",
                                        variant: "warning",
                                        onConfirm: () => void rotateApiKey()
                                    });
                                }}
                            >
                                {apiKey ? "Rotate" : "Generate"}
                            </button>
                        </div>
                    </div>
                    {baseUrl ? (
                        <p className="text-xs text-muted">
                            Jellyseerr base URL: <span className="font-mono">{baseUrl}</span>
                        </p>
                    ) : null}
                    <p className="text-xs text-muted">
                        Compatible endpoints: <span className="font-mono">/api/v1/status</span>, <span className="font-mono">/api/v1/request</span>
                    </p>
                </div>

                <div className="border-t border-white/10 pt-4">
                    <label className="text-sm font-semibold text-white">Re-encrypt service secrets</label>
                    <p className="mt-1 text-xs text-muted">
                        Use after rotating `SERVICES_SECRET_KEY` to re-encrypt stored API keys.
                    </p>
                    <button
                        type="button"
                        className="btn mt-3"
                        disabled={saving}
                        onClick={() => {
                            setModalConfig({
                                isOpen: true,
                                title: "Re-encrypt Service Secrets?",
                                message: "This will re-encrypt all stored service credentials with the current encryption key. This is a heavy operation but safe to run if your secrets are working.",
                                variant: "info",
                                onConfirm: async () => {
                                    setSaving(true);
                                    try {
                                        const res = await csrfFetch("/api/v1/admin/settings/rotate-secrets", {
                                            method: "POST",
                                            credentials: "include"
                                        });
                                        const body = await res.json().catch(() => ({}));
                                        if (!res.ok) {
                                            throw new Error(body?.error || "Failed to rotate secrets");
                                        }
                                        toast.success(`Re-encrypted ${body?.updated ?? 0} service secrets`);
                                    } catch (err: any) {
                                        toast.error(err?.message ?? "Unable to rotate secrets");
                                    } finally {
                                        setSaving(false);
                                    }
                                }
                            });
                        }}
                    >
                        Rotate service secrets
                    </button>
                </div>

                <div className="border-t border-white/10 pt-4 flex justify-end">
                    <button className="btn" type="submit" disabled={saving || settingsLoading}>
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </form>

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={() => {
                    modalConfig.onConfirm();
                    setModalConfig(prev => ({ ...prev, isOpen: false }));
                }}
                title={modalConfig.title}
                message={modalConfig.message}
                variant={modalConfig.variant}
            />
        </div>
    );
}
