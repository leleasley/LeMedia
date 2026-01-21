"use client";

import { useState, useId } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { csrfFetch } from "@/lib/csrf-client";

type JellyfinSetupProps = {
  isInitialSetup?: boolean;
  currentConfig?: {
    hostname?: string;
    port?: number;
    useSsl?: boolean;
    urlBase?: string;
    externalUrl?: string;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
};

type FormState = {
  username: string;
  password: string;
  hostname: string;
  port: number | "";
  useSsl: boolean;
  urlBase: string;
  externalUrl: string;
};

export function JellyfinSetup({
  isInitialSetup = false,
  currentConfig,
  onSuccess,
  onCancel
}: JellyfinSetupProps) {
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const sslId = useId();

  const [form, setForm] = useState<FormState>({
    username: "",
    password: "",
    hostname: currentConfig?.hostname ?? "",
    port: currentConfig?.port ?? 8096,
    useSsl: currentConfig?.useSsl ?? false,
    urlBase: currentConfig?.urlBase ?? "",
    externalUrl: currentConfig?.externalUrl ?? ""
  });

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.username.trim()) {
      toast.error("Jellyfin username is required");
      return;
    }

    if (!form.password) {
      toast.error("Jellyfin password is required");
      return;
    }

    if (isInitialSetup) {
      if (!form.hostname.trim()) {
        toast.error("Hostname is required");
        return;
      }

      if (form.port === "" || !Number.isFinite(Number(form.port))) {
        toast.error("Port must be a valid number");
        return;
      }
    }

    setConnecting(true);
    try {
      const payload: any = {
        username: form.username.trim(),
        password: form.password,
      };

      // Include server params if initial setup or if values changed
      if (isInitialSetup || form.hostname !== currentConfig?.hostname) {
        payload.hostname = form.hostname.trim();
      }
      if (isInitialSetup || form.port !== currentConfig?.port) {
        payload.port = Number(form.port);
      }
      if (isInitialSetup || form.useSsl !== currentConfig?.useSsl) {
        payload.useSsl = form.useSsl;
      }
      if (form.urlBase !== currentConfig?.urlBase) {
        payload.urlBase = form.urlBase.trim();
      }
      if (form.externalUrl !== currentConfig?.externalUrl) {
        payload.externalUrl = form.externalUrl.trim();
      }

      const res = await csrfFetch("/api/v1/auth/jellyfin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body?.error || "Authentication failed");
      }

      toast.success(
        isInitialSetup
          ? "Jellyfin configured successfully"
          : "Jellyfin reconfigured successfully"
      );

      // Clear password
      setForm(prev => ({ ...prev, password: "" }));

      // Call onSuccess callback
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to authenticate with Jellyfin");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white">
          {isInitialSetup ? "Connect to Jellyfin" : "Reconfigure Jellyfin"}
        </h3>
        <p className="text-sm text-muted mt-1">
          {isInitialSetup
            ? "Enter your Jellyfin administrator credentials and server details to get started."
            : "Update your Jellyfin connection settings."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1">
              Jellyfin Username (Admin)
            </label>
            <input
              type="text"
              value={form.username}
              onChange={e => updateForm({ username: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
              placeholder="admin"
              autoComplete="username"
              required
            />
            <p className="text-xs text-muted ml-1">
              Must be a Jellyfin administrator account
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1">
              Jellyfin Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => updateForm({ password: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        <div className="border-t border-white/10 pt-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1">
                Hostname or IP
              </label>
              <input
                type="text"
                value={form.hostname}
                onChange={e => updateForm({ hostname: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
                placeholder="jellyfin.local"
                required={isInitialSetup}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1">
                Port
              </label>
              <input
                type="number"
                value={form.port}
                onChange={e =>
                  updateForm({
                    port: e.target.value === "" ? "" : Number(e.target.value)
                  })
                }
                className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
                placeholder="8096"
                min="1"
                max="65535"
                required={isInitialSetup}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1">
                URL Base (optional)
              </label>
              <input
                type="text"
                value={form.urlBase}
                onChange={e => updateForm({ urlBase: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
                placeholder="/jellyfin"
              />
              <p className="text-xs text-muted ml-1">
                e.g., /jellyfin if hosted on a subpath
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1">
                External URL (optional)
              </label>
              <input
                type="text"
                value={form.externalUrl}
                onChange={e => updateForm({ externalUrl: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
                placeholder="https://jellyfin.example.com"
              />
              <p className="text-xs text-muted ml-1">
                Public URL for Jellyfin (if different from internal)
              </p>
            </div>
          </div>

          <AnimatedCheckbox
            id={sslId}
            label="Use SSL for internal requests"
            checked={form.useSsl}
            onChange={e => updateForm({ useSsl: e.target.checked })}
          />
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="btn"
              disabled={connecting}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={connecting}
          >
            {connecting
              ? "Connecting..."
              : isInitialSetup
              ? "Connect & Configure"
              : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
