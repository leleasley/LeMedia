"use client";

import { useEffect, useState, useId } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { csrfFetch } from "@/lib/csrf-client";

type OidcConfigState = {
    enabled: boolean;
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    authorizationUrl: string;
    tokenUrl: string;
    userinfoUrl: string;
    jwksUrl: string;
    logoutUrl: string;
    scopes: string;
    usernameClaim: string;
    emailClaim: string;
    groupsClaim: string;
    allowAutoCreate: boolean;
    matchByEmail: boolean;
    matchByUsername: boolean;
    syncGroups: boolean;
};

const defaultState: OidcConfigState = {
    enabled: false,
    issuer: "",
    clientId: "",
    clientSecret: "",
    redirectUri: "",
    authorizationUrl: "",
    tokenUrl: "",
    userinfoUrl: "",
    jwksUrl: "",
    logoutUrl: "",
    scopes: "openid profile email",
    usernameClaim: "preferred_username",
    emailClaim: "email",
    groupsClaim: "groups",
    allowAutoCreate: false,
    matchByEmail: true,
    matchByUsername: true,
    syncGroups: false
};

export function OidcSettingsPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<OidcConfigState>(defaultState);
    const toast = useToast();
    const enabledId = useId();
    const matchEmailId = useId();
    const matchUsernameId = useId();
    const autoCreateId = useId();
    const syncGroupsId = useId();

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetch("/api/v1/admin/settings/oidc", { credentials: "include" })
            .then(async res => {
                if (!active) return;
                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) {
                        toast.error("You must be an admin to view OIDC settings");
                        return;
                    }
                    throw new Error("Failed to load OIDC settings");
                }
                const data = await res.json();
                const cfg = data?.config ?? {};
                setConfig({
                    enabled: !!cfg.enabled,
                    issuer: cfg.issuer ?? "",
                    clientId: cfg.clientId ?? "",
                    clientSecret: "",
                    redirectUri: cfg.redirectUri ?? "",
                    authorizationUrl: cfg.authorizationUrl ?? "",
                    tokenUrl: cfg.tokenUrl ?? "",
                    userinfoUrl: cfg.userinfoUrl ?? "",
                    jwksUrl: cfg.jwksUrl ?? "",
                    logoutUrl: cfg.logoutUrl ?? "",
                    scopes: Array.isArray(cfg.scopes) ? cfg.scopes.join(" ") : defaultState.scopes,
                    usernameClaim: cfg.usernameClaim ?? defaultState.usernameClaim,
                    emailClaim: cfg.emailClaim ?? defaultState.emailClaim,
                    groupsClaim: cfg.groupsClaim ?? defaultState.groupsClaim,
                    allowAutoCreate: !!cfg.allowAutoCreate,
                    matchByEmail: cfg.matchByEmail !== false,
                    matchByUsername: cfg.matchByUsername !== false,
                    syncGroups: !!cfg.syncGroups
                });
            })
            .catch(() => {
                toast.error("Unable to load OIDC settings");
            })
            .finally(() => active && setLoading(false));

        return () => {
            active = false;
        };
    }, [toast]);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                enabled: config.enabled,
                issuer: config.issuer.trim(),
                clientId: config.clientId.trim(),
                clientSecret: config.clientSecret.trim(),
                redirectUri: config.redirectUri.trim(),
                authorizationUrl: config.authorizationUrl.trim(),
                tokenUrl: config.tokenUrl.trim(),
                userinfoUrl: config.userinfoUrl.trim(),
                jwksUrl: config.jwksUrl.trim(),
                logoutUrl: config.logoutUrl.trim(),
                scopes: config.scopes,
                usernameClaim: config.usernameClaim.trim(),
                emailClaim: config.emailClaim.trim(),
                groupsClaim: config.groupsClaim.trim(),
                allowAutoCreate: config.allowAutoCreate,
                matchByEmail: config.matchByEmail,
                matchByUsername: config.matchByUsername,
                syncGroups: config.syncGroups
            };
            const res = await csrfFetch("/api/v1/admin/settings/oidc", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || "Failed to save OIDC settings");
            }
            toast.success("OIDC settings saved");
        } catch (err: any) {
            toast.error(err?.message ?? "Unable to save OIDC settings");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Configuration</p>
                    <h2 className="text-xl font-semibold text-white">OIDC Settings</h2>
                    <p className="text-sm text-muted">
                        Configure SSO for Pocket ID. Save first, then use the login button on the sign-in page.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
                <AnimatedCheckbox
                    id={enabledId}
                    label="Enable OIDC login"
                    checked={config.enabled}
                    onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                />

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Issuer URL</label>
                        <input
                            className="w-full input"
                            placeholder="https://pocket-id.example.com"
                            value={config.issuer}
                            onChange={e => setConfig({ ...config, issuer: e.target.value })}
                        />
                        <p className="text-xs text-muted">Base URL for your Pocket ID issuer.</p>
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Client ID</label>
                        <input
                            className="w-full input"
                            value={config.clientId}
                            onChange={e => setConfig({ ...config, clientId: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Client Secret</label>
                        <input
                            className="w-full input"
                            type="password"
                            value={config.clientSecret}
                            onChange={e => setConfig({ ...config, clientSecret: e.target.value })}
                        />
                        <p className="text-xs text-muted">Leave blank to keep the current secret.</p>
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Redirect URI (optional)</label>
                        <input
                            className="w-full input"
                            placeholder="https://your-app/api/auth/oidc/callback"
                            value={config.redirectUri}
                            onChange={e => setConfig({ ...config, redirectUri: e.target.value })}
                        />
                        <p className="text-xs text-muted">
                            Leave blank to use the app base URL + <code className="text-indigo-300">/api/auth/oidc/callback</code>.
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Authorization URL (optional)</label>
                        <input
                            className="w-full input"
                            placeholder="https://issuer.example.com/oauth2/authorize"
                            value={config.authorizationUrl}
                            onChange={e => setConfig({ ...config, authorizationUrl: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Token URL (optional)</label>
                        <input
                            className="w-full input"
                            placeholder="https://issuer.example.com/oauth2/token"
                            value={config.tokenUrl}
                            onChange={e => setConfig({ ...config, tokenUrl: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Userinfo URL (optional)</label>
                        <input
                            className="w-full input"
                            placeholder="https://issuer.example.com/oauth2/userinfo"
                            value={config.userinfoUrl}
                            onChange={e => setConfig({ ...config, userinfoUrl: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Cert/JWKS URL (optional)</label>
                        <input
                            className="w-full input"
                            placeholder="https://issuer.example.com/.well-known/jwks.json"
                            value={config.jwksUrl}
                            onChange={e => setConfig({ ...config, jwksUrl: e.target.value })}
                        />
                    </div>
                </div>

                <div className="space-y-1 text-sm">
                    <label className="font-semibold">Logout URL (optional)</label>
                    <input
                        className="w-full input"
                        placeholder="https://issuer.example.com/oauth2/logout"
                        value={config.logoutUrl}
                        onChange={e => setConfig({ ...config, logoutUrl: e.target.value })}
                    />
                </div>

                <div className="space-y-1 text-sm">
                    <label className="font-semibold">Scopes</label>
                    <input
                        className="w-full input"
                        value={config.scopes}
                        onChange={e => setConfig({ ...config, scopes: e.target.value })}
                    />
                    <p className="text-xs text-muted">Space-separated scopes. Include openid, profile, email.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Username claim</label>
                        <input
                            className="w-full input"
                            value={config.usernameClaim}
                            onChange={e => setConfig({ ...config, usernameClaim: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Email claim</label>
                        <input
                            className="w-full input"
                            value={config.emailClaim}
                            onChange={e => setConfig({ ...config, emailClaim: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Groups claim</label>
                        <input
                            className="w-full input"
                            value={config.groupsClaim}
                            onChange={e => setConfig({ ...config, groupsClaim: e.target.value })}
                        />
                    </div>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-3">
                    <h4 className="text-sm font-semibold text-white">User Matching Options</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                        <AnimatedCheckbox
                            id={matchEmailId}
                            label="Match existing users by email"
                            checked={config.matchByEmail}
                            onChange={e => setConfig({ ...config, matchByEmail: e.target.checked })}
                        />
                        <AnimatedCheckbox
                            id={matchUsernameId}
                            label="Match existing users by username"
                            checked={config.matchByUsername}
                            onChange={e => setConfig({ ...config, matchByUsername: e.target.checked })}
                        />
                        <AnimatedCheckbox
                            id={autoCreateId}
                            label="Auto-create users when no match is found"
                            checked={config.allowAutoCreate}
                            onChange={e => setConfig({ ...config, allowAutoCreate: e.target.checked })}
                        />
                        <AnimatedCheckbox
                            id={syncGroupsId}
                            label="Sync groups from OIDC claim"
                            checked={config.syncGroups}
                            onChange={e => setConfig({ ...config, syncGroups: e.target.checked })}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-white/10">
                    <button
                        className="btn btn-primary"
                        disabled={saving || loading}
                    >
                        {saving ? "Saving…" : "Save OIDC settings"}
                    </button>
                </div>
            </form>
        </div>
    );
}
