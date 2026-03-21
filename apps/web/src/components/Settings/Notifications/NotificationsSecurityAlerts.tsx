"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";

type SecurityAlertsConfig = {
  enabled: boolean;
  loginFailureEnabled: boolean;
  newUserEnabled: boolean;
  mfaFailureEnabled: boolean;
  endpointIds: number[];
  cooldownMs: number;
};

type AvailableEndpoint = {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
};

export default function NotificationsSecurityAlerts() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [endpoints, setEndpoints] = useState<AvailableEndpoint[]>([]);
  const [form, setForm] = useState<SecurityAlertsConfig>({
    enabled: false,
    loginFailureEnabled: true,
    newUserEnabled: true,
    mfaFailureEnabled: true,
    endpointIds: [],
    cooldownMs: 600000,
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/admin/notifications/security-alerts", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) throw new Error(data?.error || "Failed to load security alerts settings");
        const cfg = data?.config ?? {};
        setForm({
          enabled: Boolean(cfg?.enabled),
          loginFailureEnabled: cfg?.loginFailureEnabled !== false,
          newUserEnabled: cfg?.newUserEnabled !== false,
          mfaFailureEnabled: cfg?.mfaFailureEnabled !== false,
          endpointIds: Array.isArray(cfg?.endpointIds)
            ? cfg.endpointIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
            : [],
          cooldownMs: Number(cfg?.cooldownMs ?? 600000),
        });
        setEndpoints(Array.isArray(data?.endpoints) ? data.endpoints : []);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err?.message || "Failed to load security alerts settings");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [toast]);

  function toggleEndpoint(id: number) {
    setForm((prev) => ({
      ...prev,
      endpointIds: prev.endpointIds.includes(id)
        ? prev.endpointIds.filter((eid) => eid !== id)
        : [...prev.endpointIds, id],
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await csrfFetch("/api/admin/notifications/security-alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save settings");
      toast.success("Security alerts settings saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await csrfFetch("/api/admin/notifications/security-alerts/test", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send test alert");
      toast.success(`Test security alert sent (${data?.delivered ?? 0}/${data?.eligible ?? 0})`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to send test alert");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-gray-400">Loading security alerts settings...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Master toggle */}
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Configuration</h2>
          <p className="mt-1 text-sm text-gray-400">
            Security alerts fire on sensitive auth events and are delivered to
            dedicated endpoints you choose below — separate from the global
            media notification channels.
          </p>
        </div>

        <AnimatedCheckbox
          id="sec-enabled"
          label="Enable Security Alerts"
          description="Master switch. When disabled, no security alerts will be delivered regardless of other settings."
          checked={form.enabled}
          onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
        />
      </div>

      {/* Alert types */}
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Alert Types</h2>
          <p className="mt-1 text-sm text-gray-400">Choose which security events trigger an alert.</p>
        </div>

        <AnimatedCheckbox
          id="sec-login-failure"
          label="Login Failures"
          description="Alert when a login attempt fails with an invalid username or password."
          checked={form.loginFailureEnabled}
          onChange={(e) => setForm((prev) => ({ ...prev, loginFailureEnabled: e.target.checked }))}
        />

        <AnimatedCheckbox
          id="sec-mfa-failure"
          label="MFA Code Failures"
          description="Alert when a user submits an invalid multi-factor authentication code."
          checked={form.mfaFailureEnabled}
          onChange={(e) => setForm((prev) => ({ ...prev, mfaFailureEnabled: e.target.checked }))}
        />

        <AnimatedCheckbox
          id="sec-new-user"
          label="New User Accounts"
          description="Alert whenever a new user account is created, whether by an admin or through self-registration."
          checked={form.newUserEnabled}
          onChange={(e) => setForm((prev) => ({ ...prev, newUserEnabled: e.target.checked }))}
        />

        <div className="pt-2">
          <label htmlFor="cooldownMs" className="block text-sm font-medium text-white mb-2">
            Alert Cooldown (ms)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Minimum time between repeated alerts for the same event type. Applies to login and MFA failures.
          </p>
          <input
            id="cooldownMs"
            type="number"
            min={1000}
            max={86400000}
            value={form.cooldownMs}
            onChange={(e) => {
              const v = Number(e.target.value);
              setForm((prev) => ({ ...prev, cooldownMs: Number.isFinite(v) ? v : prev.cooldownMs }));
            }}
            className="w-full max-w-xs px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {/* Dedicated endpoints */}
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Dedicated Security Endpoints</h2>
          <p className="mt-1 text-sm text-gray-400">
            Select which of your global notification channels should receive security alerts.
            These are independent from your regular media notification routing.
            You must have at least one endpoint selected for alerts to be delivered.
          </p>
        </div>

        {endpoints.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-6 py-8 text-center">
            <p className="text-sm text-gray-400">No global notification endpoints configured.</p>
            <p className="mt-2 text-xs text-gray-500">
              Create or enable global notification channels first under{" "}
              <a
                href="/admin/settings/notifications"
                className="text-red-300 underline underline-offset-2 hover:text-red-200"
              >
                Global Channels
              </a>.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
            {endpoints.map((ep) => {
              const selected = form.endpointIds.includes(ep.id);
              return (
                <label
                  key={ep.id}
                  className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{ep.name}</div>
                    <div className="text-xs text-gray-400 capitalize">{ep.type}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {selected && (
                      <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-200">
                        Active
                      </span>
                    )}
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleEndpoint(ep.id)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 accent-red-500"
                    />
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {form.endpointIds.length > 0 && (
          <p className="text-xs text-gray-400">
            {form.endpointIds.length} endpoint{form.endpointIds.length === 1 ? "" : "s"} selected for security alert delivery.
          </p>
        )}
      </div>

      {/* Info note */}
      <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4 text-sm text-gray-300 leading-6">
        Security alerts are delivered directly to the selected endpoints using your configured credentials.
        They do not use the system alerts routing modes and are not affected by global endpoint subscriber settings.
        Alerts are fired synchronously in the background and will not block login or registration flows.
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        <button
          onClick={sendTest}
          disabled={testing || form.endpointIds.length === 0}
          className="btn"
          title={form.endpointIds.length === 0 ? "Select at least one endpoint first" : undefined}
        >
          {testing ? "Sending..." : "Send Test Alert"}
        </button>
      </div>
    </div>
  );
}
