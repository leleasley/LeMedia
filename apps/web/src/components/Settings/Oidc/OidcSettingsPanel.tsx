"use client";

import { useCallback, useEffect, useMemo, useState, useId } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { csrfFetch } from "@/lib/csrf-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Modal } from "@/components/Common/Modal";

const DEFAULT_SCOPES = "openid profile email";

type OidcProviderState = {
    id: string;
    name: string;
    providerType?: "oidc" | "duo_websdk";
    duoApiHostname?: string;
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

type OidcSettingsState = {
    activeProviderId: string | null;
    providers: OidcProviderState[];
};

const defaultProvider: OidcProviderState = {
    id: "default",
    name: "OIDC Provider",
    providerType: "oidc",
    duoApiHostname: "",
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
    scopes: DEFAULT_SCOPES,
    usernameClaim: "preferred_username",
    emailClaim: "email",
    groupsClaim: "groups",
    allowAutoCreate: false,
    matchByEmail: true,
    matchByUsername: true,
    syncGroups: false
};

function normalizeProvider(input: Partial<OidcProviderState> & { id: string }): OidcProviderState {
    const scopes = Array.isArray(input.scopes)
        ? input.scopes.join(" ")
        : typeof input.scopes === "string"
            ? input.scopes
            : DEFAULT_SCOPES;
    const providerType = input.providerType ?? (input.name && /duo/i.test(input.name) ? "duo_websdk" : "oidc");
    return {
        ...defaultProvider,
        ...input,
        id: input.id,
        name: input.name ?? defaultProvider.name,
        providerType,
        duoApiHostname: input.duoApiHostname ?? "",
        enabled: input.enabled ?? false,
        scopes: scopes || DEFAULT_SCOPES,
        clientSecret: ""
    };
}

function createProviderId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `provider-${crypto.randomUUID()}`;
    }
    return `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function OidcSettingsPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<OidcSettingsState>({
        activeProviderId: null,
        providers: [defaultProvider]
    });
    const [selectedProviderId, setSelectedProviderId] = useState<string>(defaultProvider.id);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newProviderName, setNewProviderName] = useState("");
    const closeCreateModal = useCallback(() => setShowCreateModal(false), []);

    const toast = useToast();
    const matchEmailId = useId();
    const matchUsernameId = useId();
    const autoCreateId = useId();
    const syncGroupsId = useId();
    const activeProviderId = settings.activeProviderId;

    const selectedProvider = useMemo(() => {
        return settings.providers.find((provider) => provider.id === selectedProviderId) ?? settings.providers[0];
    }, [settings.providers, selectedProviderId]);

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
                const rawSettings = data?.settings ?? {};
                const providers: OidcProviderState[] = Array.isArray(rawSettings.providers) && rawSettings.providers.length
                    ? rawSettings.providers.map((provider: OidcProviderState) => normalizeProvider(provider))
                    : [normalizeProvider({ id: defaultProvider.id })];

                let activeProviderId: string | null = rawSettings.activeProviderId ?? null;
                if (activeProviderId && !providers.some((provider: OidcProviderState) => provider.id === activeProviderId)) {
                    activeProviderId = null;
                }
                if (!activeProviderId) {
                    const enabledProvider = providers.find((provider) => provider.enabled);
                    activeProviderId = enabledProvider ? enabledProvider.id : null;
                }

                const normalizedProviders = providers.map((provider) => ({
                    ...provider,
                    enabled: activeProviderId ? provider.id === activeProviderId : false
                }));

                setSettings({
                    activeProviderId,
                    providers: normalizedProviders
                });

                setSelectedProviderId(activeProviderId ?? normalizedProviders[0].id);
            })
            .catch(() => {
                toast.error("Unable to load OIDC settings");
            })
            .finally(() => active && setLoading(false));

        return () => {
            active = false;
        };
    }, [toast]);

    useEffect(() => {
        if (!settings.providers.length) return;
        if (settings.providers.some((provider) => provider.id === selectedProviderId)) return;
        setSelectedProviderId(settings.providers[0].id);
    }, [selectedProviderId, settings.providers]);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                activeProviderId: settings.activeProviderId,
                providers: settings.providers.map((provider) => ({
                    ...provider,
                    enabled: settings.activeProviderId ? provider.id === settings.activeProviderId : false,
                    scopes: provider.scopes
                }))
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

    function updateProvider(id: string, patch: Partial<OidcProviderState>) {
        setSettings(prev => ({
            ...prev,
            providers: prev.providers.map((provider) =>
                provider.id === id ? { ...provider, ...patch } : provider
            )
        }));
    }

    function handleAddProvider() {
        setNewProviderName("");
        setShowCreateModal(true);
    }

    function confirmAddProvider(e?: React.FormEvent) {
        if (e) e.preventDefault();
        const name = newProviderName.trim() || `OIDC Provider ${settings.providers.length + 1}`;
        const id = createProviderId();
        const newProvider: OidcProviderState = {
            ...defaultProvider,
            id,
            name,
            enabled: false
        };
        setSettings(prev => ({
            ...prev,
            providers: [...prev.providers, newProvider]
        }));
        setSelectedProviderId(id);
        closeCreateModal();
    }

    function handleRemoveProvider() {
        if (!selectedProvider || settings.providers.length <= 1) return;
        setSettings(prev => {
            const nextProviders = prev.providers.filter((provider) => provider.id !== selectedProvider.id);
            let nextActive = prev.activeProviderId;
            if (nextActive === selectedProvider.id) {
                nextActive = null;
            }
            return {
                activeProviderId: nextActive,
                providers: nextProviders
            };
        });
    }

    function setActiveProvider(id: string | null) {
        setSettings(prev => ({
            activeProviderId: id,
            providers: prev.providers.map((provider) => ({
                ...provider,
                enabled: id ? provider.id === id : false
            }))
        }));
    }

    if (!selectedProvider) {
        return null;
    }

    const isActive = activeProviderId === selectedProvider.id;
    const isDuoProvider = selectedProvider.providerType === "duo_websdk" || /duo/i.test(selectedProvider.name || "");

    return (
        <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Configuration</p>
                    <h2 className="text-xl font-semibold text-white">OIDC Providers</h2>
                    <p className="text-sm text-muted">
                        Add multiple OIDC providers, then choose one to power the SSO button on the login screen.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="btn" type="button" onClick={handleAddProvider} disabled={loading || saving}>
                        Add provider
                    </button>
                    <button
                        className="btn btn-danger"
                        type="button"
                        onClick={handleRemoveProvider}
                        disabled={loading || saving || settings.providers.length <= 1}
                    >
                        Remove provider
                    </button>
                </div>
            </div>

            <Modal
                open={showCreateModal}
                title="Name your provider"
                onClose={closeCreateModal}
            >
                <form onSubmit={confirmAddProvider} className="space-y-4">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Provider name</label>
                        <input
                            className="w-full input"
                            placeholder="PocketID, Duo, Okta..."
                            value={newProviderName}
                            onChange={e => setNewProviderName(e.target.value)}
                        />
                        <p className="text-xs text-muted">This is only visible to admins.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" className="btn" onClick={closeCreateModal}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Create provider
                        </button>
                    </div>
                </form>
            </Modal>

            <form onSubmit={handleSave} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Provider</label>
                        <Select value={selectedProvider.id} onValueChange={setSelectedProviderId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select provider" />
                            </SelectTrigger>
                            <SelectContent>
                                {settings.providers.map((provider) => (
                                    <SelectItem key={provider.id} value={provider.id}>
                                        {provider.name || provider.id}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted">Pick which provider to edit.</p>
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Provider name</label>
                        <input
                            className="w-full input"
                            value={selectedProvider.name}
                            onChange={e => {
                                const name = e.target.value;
                                updateProvider(selectedProvider.id, {
                                    name,
                                    providerType: /duo/i.test(name) ? "duo_websdk" : selectedProvider.providerType ?? "oidc"
                                });
                            }}
                        />
                        <p className="text-xs text-muted">Shown to admins when selecting providers.</p>
                    </div>
                </div>

                {isDuoProvider ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm space-y-3">
                        <div>
                            <h4 className="text-sm font-semibold text-white">Duo Web SDK setup</h4>
                            <p className="text-xs text-muted mt-1">
                                Create a Duo Web SDK application first. This is not standard OIDC, so we use Duo’s API hostname + keys.
                            </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1">
                                <label className="font-semibold text-white">Duo API hostname</label>
                                <input
                                    className="w-full input"
                                    placeholder="api-xxxxxxxx.duosecurity.com"
                                    value={selectedProvider.duoApiHostname ?? ""}
                                    onChange={e => updateProvider(selectedProvider.id, { duoApiHostname: e.target.value, providerType: "duo_websdk" })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="font-semibold text-white">Integration key (Client ID)</label>
                                <input
                                    className="w-full input"
                                    value={selectedProvider.clientId}
                                    onChange={e => updateProvider(selectedProvider.id, { clientId: e.target.value, providerType: "duo_websdk" })}
                                />
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1">
                                <label className="font-semibold text-white">Secret key (Client Secret)</label>
                                <input
                                    className="w-full input"
                                    type="password"
                                    value={selectedProvider.clientSecret}
                                    onChange={e => updateProvider(selectedProvider.id, { clientSecret: e.target.value, providerType: "duo_websdk" })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="font-semibold text-white">Redirect URI</label>
                                <input
                                    className="w-full input"
                                    value={selectedProvider.redirectUri}
                                    onChange={e => updateProvider(selectedProvider.id, { redirectUri: e.target.value, providerType: "duo_websdk" })}
                                />
                                <p className="text-xs text-muted">Duo Web SDK callback endpoint in this app.</p>
                            </div>
                        </div>
                    </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Provider ID</label>
                        <input className="w-full input" value={selectedProvider.id} readOnly />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">SSO status</label>
                        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <AnimatedCheckbox
                                id={`active-${selectedProvider.id}`}
                                label="Use this provider for SSO"
                                checked={isActive}
                                onChange={e => setActiveProvider(e.target.checked ? selectedProvider.id : null)}
                            />
                        </div>
                        <p className="text-xs text-muted">Only one provider can be active at a time.</p>
                    </div>
                </div>

                {!isDuoProvider ? (
                <>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Issuer URL</label>
                        <input
                            className="w-full input"
                            placeholder="https://issuer.example.com"
                            value={selectedProvider.issuer}
                            onChange={e => updateProvider(selectedProvider.id, { issuer: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Client ID</label>
                        <input
                            className="w-full input"
                            value={selectedProvider.clientId}
                            onChange={e => updateProvider(selectedProvider.id, { clientId: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Client Secret</label>
                        <input
                            className="w-full input"
                            type="password"
                            value={selectedProvider.clientSecret}
                            onChange={e => updateProvider(selectedProvider.id, { clientSecret: e.target.value })}
                        />
                        <p className="text-xs text-muted">Leave blank to keep the current secret.</p>
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold text-white">Redirect URI (optional)</label>
                        <input
                            className="w-full input"
                            placeholder="https://your-app/api/auth/oidc/callback"
                            value={selectedProvider.redirectUri}
                            onChange={e => updateProvider(selectedProvider.id, { redirectUri: e.target.value })}
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
                            value={selectedProvider.authorizationUrl}
                            onChange={e => updateProvider(selectedProvider.id, { authorizationUrl: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Token URL (optional)</label>
                        <input
                            className="w-full input"
                            placeholder="https://issuer.example.com/oauth2/token"
                            value={selectedProvider.tokenUrl}
                            onChange={e => updateProvider(selectedProvider.id, { tokenUrl: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Userinfo URL (optional)</label>
                        <input
                            className="w-full input"
                            placeholder="https://issuer.example.com/oauth2/userinfo"
                            value={selectedProvider.userinfoUrl}
                            onChange={e => updateProvider(selectedProvider.id, { userinfoUrl: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Cert/JWKS URL (optional)</label>
                        <input
                            className="w-full input"
                            placeholder="https://issuer.example.com/.well-known/jwks.json"
                            value={selectedProvider.jwksUrl}
                            onChange={e => updateProvider(selectedProvider.id, { jwksUrl: e.target.value })}
                        />
                    </div>
                </div>

                <div className="space-y-1 text-sm">
                    <label className="font-semibold">Logout URL (optional)</label>
                    <input
                        className="w-full input"
                        placeholder="https://issuer.example.com/oauth2/logout"
                        value={selectedProvider.logoutUrl}
                        onChange={e => updateProvider(selectedProvider.id, { logoutUrl: e.target.value })}
                    />
                </div>

                <div className="space-y-1 text-sm">
                    <label className="font-semibold">Scopes</label>
                    <input
                        className="w-full input"
                        value={selectedProvider.scopes}
                        onChange={e => updateProvider(selectedProvider.id, { scopes: e.target.value })}
                    />
                    <p className="text-xs text-muted">Space-separated scopes. Include openid, profile, email.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Username claim</label>
                        <input
                            className="w-full input"
                            value={selectedProvider.usernameClaim}
                            onChange={e => updateProvider(selectedProvider.id, { usernameClaim: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Email claim</label>
                        <input
                            className="w-full input"
                            value={selectedProvider.emailClaim}
                            onChange={e => updateProvider(selectedProvider.id, { emailClaim: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1 text-sm">
                        <label className="font-semibold">Groups claim</label>
                        <input
                            className="w-full input"
                            value={selectedProvider.groupsClaim}
                            onChange={e => updateProvider(selectedProvider.id, { groupsClaim: e.target.value })}
                        />
                    </div>
                </div>
                </>
                ) : null}

                <div className="border-t border-white/10 pt-4 space-y-3">
                    <h4 className="text-sm font-semibold text-white">User Matching Options</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                        <AnimatedCheckbox
                            id={matchEmailId}
                            label="Match existing users by email"
                            checked={selectedProvider.matchByEmail}
                            onChange={e => updateProvider(selectedProvider.id, { matchByEmail: e.target.checked })}
                        />
                        <AnimatedCheckbox
                            id={matchUsernameId}
                            label="Match existing users by username"
                            checked={selectedProvider.matchByUsername}
                            onChange={e => updateProvider(selectedProvider.id, { matchByUsername: e.target.checked })}
                        />
                        <AnimatedCheckbox
                            id={autoCreateId}
                            label="Auto-create users when no match is found"
                            checked={selectedProvider.allowAutoCreate}
                            onChange={e => updateProvider(selectedProvider.id, { allowAutoCreate: e.target.checked })}
                        />
                        <AnimatedCheckbox
                            id={syncGroupsId}
                            label="Sync groups from OIDC claim"
                            checked={selectedProvider.syncGroups}
                            onChange={e => updateProvider(selectedProvider.id, { syncGroups: e.target.checked })}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-white/10">
                    <button className="btn btn-primary" disabled={saving || loading}>
                        {saving ? "Saving…" : "Save OIDC settings"}
                    </button>
                </div>
            </form>
        </div>
    );
}
