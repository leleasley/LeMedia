"use client";

import { useEffect, useId, useState } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { ConfirmationModal } from "@/components/Common/ConfirmationModal";
import { csrfFetch } from "@/lib/csrf-client";
import { MaintenanceSection } from "@/components/Settings/General/sections/MaintenanceSection";
import { SessionSchedulingSection } from "@/components/Settings/General/sections/SessionSchedulingSection";
import { AuthenticationSection } from "@/components/Settings/General/sections/AuthenticationSection";
import { MediaCacheSection } from "@/components/Settings/General/sections/MediaCacheSection";
import { ApiTokenSection } from "@/components/Settings/General/sections/ApiTokenSection";
import { SecretsSection } from "@/components/Settings/General/sections/SecretsSection";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
});

export function AdminSettingsPanel() {
    const imageProxyId = useId();
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [rotatingApiKey, setRotatingApiKey] = useState(false);
    const [sessionDays, setSessionDays] = useState<number | "">("");
    const [sessionDirty, setSessionDirty] = useState(false);
    const [jobTimezone, setJobTimezone] = useState("");
    const [jobTimezoneDirty, setJobTimezoneDirty] = useState(false);
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

    const { data: settings, mutate: mutateSettings, isLoading: settingsLoading } = useSWR("/api/v1/admin/settings", fetcher, {
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
            if (!sessionDirty) {
                setSessionDays(seconds ? Math.round(seconds / (60 * 60 * 24)) : "");
            }
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
            if (!jobTimezoneDirty && typeof settings.job_timezone === "string") {
                setJobTimezone(settings.job_timezone);
            }
        }
    }, [settings, sessionDirty, jobTimezoneDirty]);

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
        if (rotatingApiKey) return;
        setRotatingApiKey(true);
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
        } finally {
            setRotatingApiKey(false);
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
                    job_timezone: jobTimezone
                }),
                credentials: "include"
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || "Failed to save settings");
            toast.success("Settings saved");
            setSessionDirty(false);
            setJobTimezoneDirty(false);
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

    async function copyApiKey() {
        if (!apiKey) return;
        try {
            await navigator.clipboard.writeText(apiKey);
            toast.success("API token copied");
        } catch {
            toast.error("Failed to copy API token");
        }
    }

    function handleRotateOrGenerateApiKey() {
        if (!apiKey) {
            void rotateApiKey();
            return;
        }

        setModalConfig({
            isOpen: true,
            title: "Rotate API Key?",
            message:
                "Existing integrations using the current key will stop working immediately. You will need to update them with the new key.",
            variant: "warning",
            onConfirm: () => void rotateApiKey(),
        });
    }

    function handleRotateServiceSecrets() {
        setModalConfig({
            isOpen: true,
            title: "Re-encrypt Service Secrets?",
            message:
                "This will re-encrypt all stored service credentials with the current encryption key. This is a heavy operation but safe to run if your secrets are working.",
            variant: "info",
            onConfirm: async () => {
                setSaving(true);
                try {
                    const res = await csrfFetch("/api/v1/admin/settings/rotate-secrets", {
                        method: "POST",
                        credentials: "include",
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
            },
        });
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
                <MaintenanceSection
                    maintenanceEnabled={maintenanceEnabled}
                    maintenanceMessage={maintenanceMessage}
                    maintenanceLoading={maintenanceLoading}
                    savingMaintenance={savingMaintenance}
                    onMaintenanceEnabledChange={setMaintenanceEnabled}
                    onMaintenanceMessageChange={setMaintenanceMessage}
                    onSave={saveMaintenance}
                />

                <SessionSchedulingSection
                    sessionDays={sessionDays}
                    settingsLoading={settingsLoading}
                    jobTimezone={jobTimezone}
                    timezoneOptions={timezoneOptions}
                    onSessionDaysChange={(nextValue) => {
                        setSessionDirty(true);
                        setSessionDays(nextValue);
                    }}
                    onJobTimezoneChange={(nextValue) => {
                        setJobTimezoneDirty(true);
                        setJobTimezone(nextValue);
                    }}
                />

                <AuthenticationSection
                    otpId={otpId}
                    ssoId={ssoId}
                    mfaAdminId={mfaAdminId}
                    mfaAllId={mfaAllId}
                    otpEnabled={otpEnabled}
                    ssoEnabled={ssoEnabled}
                    enforceMfaAdmin={enforceMfaAdmin}
                    enforceMfaAll={enforceMfaAll}
                    settingsLoading={settingsLoading}
                    savingAuth={savingAuth}
                    onOtpChange={(nextValue) => {
                        const previousValue = otpEnabled;
                        setOtpEnabled(nextValue);
                        void saveAuthSetting("otp", nextValue, previousValue);
                    }}
                    onSsoChange={(nextValue) => {
                        const previousValue = ssoEnabled;
                        setSsoEnabled(nextValue);
                        void saveAuthSetting("sso", nextValue, previousValue);
                    }}
                    onEnforceMfaAdminChange={(nextValue) => {
                        const previousValue = enforceMfaAdmin;
                        setEnforceMfaAdmin(nextValue);
                        void saveAuthSetting("mfa_admin", nextValue, previousValue);
                    }}
                    onEnforceMfaAllChange={(nextValue) => {
                        const previousValue = enforceMfaAll;
                        setEnforceMfaAll(nextValue);
                        void saveAuthSetting("mfa_all", nextValue, previousValue);
                    }}
                />

                <MediaCacheSection
                    imageProxyId={imageProxyId}
                    imageProxyEnabled={imageProxyEnabled}
                    settingsLoading={settingsLoading}
                    savingImageProxy={savingImageProxy}
                    onImageProxyChange={(nextValue) => {
                        const previousValue = imageProxyEnabled;
                        setImageProxyEnabled(nextValue);
                        void saveImageProxy(nextValue, previousValue);
                    }}
                />

                <ApiTokenSection
                    apiKey={apiKey}
                    apiKeyVisible={apiKeyVisible}
                    apiKeyLoading={apiKeyLoading}
                    rotatingApiKey={rotatingApiKey}
                    saving={saving}
                    baseUrl={baseUrl}
                    onToggleVisibility={() => setApiKeyVisible((prev) => !prev)}
                    onCopy={() => void copyApiKey()}
                    onRotateOrGenerate={handleRotateOrGenerateApiKey}
                />

                <SecretsSection
                    saving={saving}
                    onRotateServiceSecrets={handleRotateServiceSecrets}
                />

                <div className="border-t border-white/10 pt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted">Applies session duration and job scheduling changes.</p>
                    <button className="btn" type="submit" disabled={saving || settingsLoading}>
                        {saving ? "Saving..." : "Save changes"}
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
