"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OAuthProviderState = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  configured: boolean;
  hasClientSecret: boolean;
};

type TelegramProviderState = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  configured: boolean;
  hasClientSecret: boolean;
};

type ThirdPartySettingsState = {
  google: OAuthProviderState;
  github: OAuthProviderState;
  telegram: TelegramProviderState;
};

type ProviderKey = "google" | "github" | "telegram";

const defaultSettings: ThirdPartySettingsState = {
  google: { enabled: false, clientId: "", clientSecret: "", configured: false, hasClientSecret: false },
  github: { enabled: false, clientId: "", clientSecret: "", configured: false, hasClientSecret: false },
  telegram: { enabled: false, clientId: "", clientSecret: "", configured: false, hasClientSecret: false }
};

export function ThirdPartySignInsPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>("google");
  const [settings, setSettings] = useState<ThirdPartySettingsState>(defaultSettings);
  const [telegramIconUrl, setTelegramIconUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch("/api/admin/settings/third-party", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load 3rd party settings");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        const incoming = data?.settings;
        setTelegramIconUrl(String(data?.telegramIconUrl ?? ""));
        setSettings({
          google: {
            enabled: Boolean(incoming?.google?.enabled),
            clientId: String(incoming?.google?.clientId ?? ""),
            clientSecret: "",
            configured: Boolean(incoming?.google?.configured),
            hasClientSecret: Boolean(incoming?.google?.hasClientSecret)
          },
          github: {
            enabled: Boolean(incoming?.github?.enabled),
            clientId: String(incoming?.github?.clientId ?? ""),
            clientSecret: "",
            configured: Boolean(incoming?.github?.configured),
            hasClientSecret: Boolean(incoming?.github?.hasClientSecret)
          },
          telegram: {
            enabled: Boolean(incoming?.telegram?.enabled),
            clientId: String(incoming?.telegram?.clientId ?? ""),
            clientSecret: "",
            configured: Boolean(incoming?.telegram?.configured),
            hasClientSecret: Boolean(incoming?.telegram?.hasClientSecret)
          }
        });
      })
      .catch((err) => {
        console.error(err);
        toast.error("Unable to load 3rd party sign-in settings");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [toast]);

  const selectedData = useMemo(() => settings[selectedProvider], [settings, selectedProvider]);

  function updateOauthProvider(provider: "google" | "github", patch: Partial<OAuthProviderState>) {
    setSettings((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        ...patch
      }
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        settings: {
          google: {
            enabled: settings.google.enabled,
            clientId: settings.google.clientId,
            clientSecret: settings.google.clientSecret
          },
          github: {
            enabled: settings.github.enabled,
            clientId: settings.github.clientId,
            clientSecret: settings.github.clientSecret
          },
          telegram: {
            enabled: settings.telegram.enabled,
            clientId: settings.telegram.clientId,
            clientSecret: settings.telegram.clientSecret
          }
        }
      };

      const res = await csrfFetch("/api/admin/settings/third-party", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to save settings");
      }

      const incoming = body?.settings;
      setTelegramIconUrl(String(body?.telegramIconUrl ?? ""));
      setSettings((prev) => ({
        google: {
          enabled: Boolean(incoming?.google?.enabled),
          clientId: String(incoming?.google?.clientId ?? ""),
          clientSecret: "",
          configured: Boolean(incoming?.google?.configured),
          hasClientSecret: Boolean(incoming?.google?.hasClientSecret) || prev.google.hasClientSecret
        },
        github: {
          enabled: Boolean(incoming?.github?.enabled),
          clientId: String(incoming?.github?.clientId ?? ""),
          clientSecret: "",
          configured: Boolean(incoming?.github?.configured),
          hasClientSecret: Boolean(incoming?.github?.hasClientSecret) || prev.github.hasClientSecret
        },
        telegram: {
          enabled: Boolean(incoming?.telegram?.enabled),
          clientId: String(incoming?.telegram?.clientId ?? ""),
          clientSecret: "",
          configured: Boolean(incoming?.telegram?.configured),
          hasClientSecret: Boolean(incoming?.telegram?.hasClientSecret) || prev.telegram.hasClientSecret
        }
      }));

      toast.success("3rd party sign-in settings saved");
    } catch (err: any) {
      toast.error(err?.message || "Unable to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-6 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Users & Auth</p>
        <h2 className="text-xl font-semibold text-white">3rd Party Sign-ins</h2>
        <p className="text-sm text-muted mt-1">Enable providers and manage OAuth credentials for the login page.</p>
      </div>

      <div className="space-y-1 text-sm max-w-md">
        <label className="font-semibold text-white">Provider</label>
        <Select value={selectedProvider} onValueChange={(value) => setSelectedProvider(value as ProviderKey)}>
          <SelectTrigger>
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="github">GitHub</SelectItem>
            <SelectItem value="telegram">Telegram</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold text-white capitalize">{selectedProvider}</h3>
            <p className="text-sm text-muted">Provider appears under Other sign-in methods only when enabled and configured.</p>
            {selectedProvider === "telegram" ? (
              <p className="text-xs text-muted mt-2">
                Setup required in BotFather Web Login. Follow Telegram OpenID Connect docs: {" "}
                <a
                  href="https://core.telegram.org/bots/telegram-login#openid-connect"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-300 hover:text-blue-200 underline"
                >
                  Telegram OIDC setup
                </a>
                {telegramIconUrl ? (
                  <>
                    {" "}Use this icon URL in BotFather: <span className="font-mono">{telegramIconUrl}</span>
                  </>
                ) : (
                  <> Set `APP_BASE_URL` to generate your icon URL automatically.</>
                )}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={selectedData.enabled ? "btn btn-danger" : "btn btn-primary"}
            onClick={() => {
              if (selectedProvider === "google" || selectedProvider === "github") {
                updateOauthProvider(selectedProvider, { enabled: !selectedData.enabled });
                return;
              }
              setSettings((prev) => ({
                ...prev,
                telegram: { ...prev.telegram, enabled: !prev.telegram.enabled }
              }));
            }}
          >
            {selectedData.enabled ? "Disable" : "Enable"}
          </button>
        </div>

        {selectedProvider === "google" || selectedProvider === "github" || selectedProvider === "telegram" ? (
          <>
            <div className="space-y-1 text-sm">
              <label className="font-semibold text-white">Client ID</label>
              <input
                className="w-full input"
                value={settings[selectedProvider].clientId}
                onChange={(e) => {
                  if (selectedProvider === "google" || selectedProvider === "github") {
                    updateOauthProvider(selectedProvider, { clientId: e.target.value });
                    return;
                  }
                  setSettings((prev) => ({
                    ...prev,
                    telegram: { ...prev.telegram, clientId: e.target.value }
                  }));
                }}
                placeholder="Enter OAuth client ID"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1 text-sm">
              <label className="font-semibold text-white">Client Secret</label>
              <input
                className="w-full input"
                type="password"
                value={settings[selectedProvider].clientSecret}
                onChange={(e) => {
                  if (selectedProvider === "google" || selectedProvider === "github") {
                    updateOauthProvider(selectedProvider, { clientSecret: e.target.value });
                    return;
                  }
                  setSettings((prev) => ({
                    ...prev,
                    telegram: { ...prev.telegram, clientSecret: e.target.value }
                  }));
                }}
                placeholder={settings[selectedProvider].hasClientSecret ? "••••••••••••••••" : "Enter OAuth client secret"}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted">
                {settings[selectedProvider].hasClientSecret
                  ? "A secret is already stored. Leave blank to keep it unchanged."
                  : "No secret stored yet."}
              </p>
            </div>
            <div className="text-xs text-muted">
              Status: {settings[selectedProvider].configured ? "Configured" : "Not configured"}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted">Not supported.</div>
        )}
      </div>

      <div className="flex items-center justify-end">
        <button type="submit" className="btn btn-primary" disabled={loading || saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
