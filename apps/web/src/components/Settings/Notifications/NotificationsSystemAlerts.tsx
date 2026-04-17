"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

type SystemAlertsConfig = {
  enabled: boolean;
  highLatencyEnabled: boolean;
  serviceUnreachableEnabled: boolean;
  indexersUnavailableEnabled: boolean;
  routingMode: "global_only" | "target_users" | "target_users_and_global" | "all_user_endpoints_non_email";
  targetUserIds: number[];
  latencyThresholdMs: number;
  requestTimeoutMs: number;
  cooldownMs: number;
};

type AlertUser = {
  id: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  banned: boolean;
  notificationEndpointIds: number[];
};

type PreviewEndpoint = {
  id: number;
  name: string;
  type: string;
  isGlobal: boolean;
  events: ("system_alert_high_latency" | "system_alert_service_unreachable" | "system_alert_indexers_unavailable")[];
};

type PreviewData = {
  unionCount: number;
  byType: Record<string, number>;
  union: PreviewEndpoint[];
};

export default function NotificationsSystemAlerts() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [users, setUsers] = useState<AlertUser[]>([]);
  const [form, setForm] = useState<SystemAlertsConfig>({
    enabled: true,
    highLatencyEnabled: true,
    serviceUnreachableEnabled: true,
    indexersUnavailableEnabled: true,
    routingMode: "target_users_and_global",
    targetUserIds: [],
    latencyThresholdMs: 40000,
    requestTimeoutMs: 45000,
    cooldownMs: 900000
  });

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag before system alerts fetch; synchronous state update before async operation
    setLoading(true);
    fetch("/api/admin/notifications/system-alerts", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) throw new Error(data?.error || "Failed to load system alerts settings");
        const cfg = data?.config ?? data;
        setForm({
          enabled: Boolean(cfg?.enabled),
          highLatencyEnabled: Boolean(cfg?.highLatencyEnabled),
          serviceUnreachableEnabled: Boolean(cfg?.serviceUnreachableEnabled),
          indexersUnavailableEnabled: Boolean(cfg?.indexersUnavailableEnabled),
          routingMode: cfg?.routingMode === "global_only" || cfg?.routingMode === "target_users" || cfg?.routingMode === "target_users_and_global" || cfg?.routingMode === "all_user_endpoints_non_email"
            ? cfg.routingMode
            : "target_users_and_global",
          targetUserIds: Array.isArray(cfg?.targetUserIds)
            ? cfg.targetUserIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
            : [],
          latencyThresholdMs: Number(cfg?.latencyThresholdMs ?? 40000),
          requestTimeoutMs: Number(cfg?.requestTimeoutMs ?? 45000),
          cooldownMs: Number(cfg?.cooldownMs ?? 900000)
        });
        setUsers(Array.isArray(data?.users) ? data.users : []);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err?.message || "Failed to load system alerts settings");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [toast]);

  const updateNumber = (key: keyof SystemAlertsConfig, value: string) => {
    const parsed = Number(value);
    setForm((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? parsed : 0
    }));
  };

  async function save() {
    if (form.requestTimeoutMs < form.latencyThresholdMs) {
      toast.error("Request timeout must be greater than or equal to latency threshold");
      return;
    }
    if ((form.routingMode === "target_users" || form.routingMode === "target_users_and_global") && form.targetUserIds.length === 0) {
      toast.error("Select at least one target user for this routing mode");
      return;
    }

    setSaving(true);
    try {
      const res = await csrfFetch("/api/admin/notifications/system-alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save settings");
      toast.success("System alerts settings saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function testAlert() {
    setTesting(true);
    try {
      const res = await csrfFetch("/api/admin/notifications/system-alerts/test", {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send test alert");
      toast.success(`Test system alert sent (${data?.delivered ?? 0}/${data?.eligible ?? 0})`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to send test alert");
    } finally {
      setTesting(false);
    }
  }

  async function previewRecipients() {
    setPreviewing(true);
    try {
      const res = await csrfFetch("/api/admin/notifications/system-alerts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          routingMode: form.routingMode,
          targetUserIds: form.targetUserIds
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to preview recipients");
      setPreview(data as PreviewData);
      toast.success("Recipient preview updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to preview recipients");
    } finally {
      setPreviewing(false);
    }
  }

  if (loading) {
    return <div className="p-4">Loading system alerts settings...</div>;
  }

  const selectableUsers = users.filter((user) => !user.banned);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <AnimatedCheckbox
          id="alerts-enabled"
          label="Enable System Alerts"
          checked={form.enabled}
          onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
        />

        <AnimatedCheckbox
          id="alerts-high-latency"
          label="High Latency Alerts"
          description="Alert when a health check exceeds your latency threshold"
          checked={form.highLatencyEnabled}
          onChange={(e) => setForm((prev) => ({ ...prev, highLatencyEnabled: e.target.checked }))}
        />

        <AnimatedCheckbox
          id="alerts-unreachable"
          label="Service Unreachable Alerts"
          description="Alert when Sonarr/Radarr/Prowlarr/Jellyfin health checks fail"
          checked={form.serviceUnreachableEnabled}
          onChange={(e) => setForm((prev) => ({ ...prev, serviceUnreachableEnabled: e.target.checked }))}
        />

        <AnimatedCheckbox
          id="alerts-indexers"
          label="Indexers Unavailable Alerts"
          description="Alert when Prowlarr has no enabled indexers or indexer checks fail"
          checked={form.indexersUnavailableEnabled}
          onChange={(e) => setForm((prev) => ({ ...prev, indexersUnavailableEnabled: e.target.checked }))}
        />

      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white">Routing</h3>
          <p className="text-sm text-gray-400">Choose where system alerts should be delivered.</p>
        </div>
        <div className="max-w-xl">
          <AdaptiveSelect
            value={form.routingMode}
            onValueChange={(value) => {
              setForm((prev) => ({
                ...prev,
                routingMode: value as SystemAlertsConfig["routingMode"],
                targetUserIds:
                  value === "target_users" || value === "target_users_and_global"
                    ? prev.targetUserIds
                    : []
              }));
            }}
            options={[
              { value: "target_users_and_global", label: "Target user + global endpoints" },
              { value: "target_users", label: "Target user only" },
              { value: "global_only", label: "Global endpoints only" },
              { value: "all_user_endpoints_non_email", label: "System Alerts Bot (all user endpoints, no email)" }
            ]}
            placeholder="Select routing mode"
          />
        </div>
      </div>

      {(form.routingMode === "target_users" || form.routingMode === "target_users_and_global") ? (
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white">Target Users</h3>
          <p className="text-sm text-gray-400">Choose which users receive system alerts via their assigned notification channels. Select one or more.</p>
        </div>
        <div className="max-w-xl rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 overflow-hidden">
          {selectableUsers.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">No users with notification channels configured.</p>
          ) : (
            selectableUsers.map((u) => {
              const channelCount = Array.isArray(u.notificationEndpointIds) ? u.notificationEndpointIds.length : 0;
              const label = u.displayName || u.username;
              const checked = form.targetUserIds.includes(u.id);
              return (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{label}</div>
                    <div className="text-xs text-gray-400">@{u.username} &middot; {channelCount} channel{channelCount === 1 ? "" : "s"}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setForm((prev) => ({
                        ...prev,
                        targetUserIds: checked
                          ? prev.targetUserIds.filter((id) => id !== u.id)
                          : [...prev.targetUserIds, u.id],
                      }));
                    }}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 accent-amber-400"
                  />
                </label>
              );
            })
          )}
        </div>
        {form.targetUserIds.length > 0 && (
          <p className="text-xs text-gray-400">{form.targetUserIds.length} user{form.targetUserIds.length === 1 ? "" : "s"} selected.</p>
        )}
      </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="form-row">
          <label htmlFor="latencyThresholdMs" className="block text-sm font-medium mb-2">
            Latency Threshold (ms)
          </label>
          <input
            id="latencyThresholdMs"
            type="number"
            min={1000}
            max={600000}
            value={form.latencyThresholdMs}
            onChange={(e) => updateNumber("latencyThresholdMs", e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="form-row">
          <label htmlFor="requestTimeoutMs" className="block text-sm font-medium mb-2">
            Request Timeout (ms)
          </label>
          <input
            id="requestTimeoutMs"
            type="number"
            min={1000}
            max={600000}
            value={form.requestTimeoutMs}
            onChange={(e) => updateNumber("requestTimeoutMs", e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="form-row">
          <label htmlFor="cooldownMs" className="block text-sm font-medium mb-2">
            Alert Cooldown (ms)
          </label>
          <input
            id="cooldownMs"
            type="number"
            min={1000}
            max={86400000}
            value={form.cooldownMs}
            onChange={(e) => updateNumber("cooldownMs", e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4 text-sm text-gray-300">
        Delivery targets are configured in each notification channel by enabling:
        <span className="font-semibold text-white"> System Alert: High Latency</span>,
        <span className="font-semibold text-white"> System Alert: Service Unreachable</span>, and
        <span className="font-semibold text-white"> System Alert: Indexers Unavailable</span>.
      </div>

      {preview ? (
        <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white">Recipient Preview</h3>
            <span className="text-xs text-gray-400">{preview.unionCount} endpoint{preview.unionCount === 1 ? "" : "s"}</span>
          </div>
          <div className="text-sm text-gray-300">
            {Object.entries(preview.byType).length ? (
              Object.entries(preview.byType)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([type, count]) => `${type}: ${count}`)
                .join(" • ")
            ) : "No eligible endpoints"}
          </div>
          <div className="max-h-56 overflow-auto rounded border border-white/10">
            {preview.union.length ? (
              <ul className="divide-y divide-white/10 text-sm">
                {preview.union.map((endpoint) => (
                  <li key={endpoint.id} className="px-3 py-2">
                    <div className="text-white">{endpoint.name}</div>
                    <div className="text-xs text-gray-400">
                      {endpoint.type} • {endpoint.isGlobal ? "global" : "user-assigned"} • {endpoint.events.join(", ")}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-3 text-sm text-gray-400">No endpoints match current routing and event filters.</div>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          onClick={previewRecipients}
          disabled={previewing}
          className="btn"
        >
          {previewing ? "Previewing..." : "Preview Recipients"}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={testAlert}
          disabled={testing}
          className="btn"
        >
          {testing ? "Sending..." : "Send Test Alert"}
        </button>
      </div>
    </div>
  );
}
