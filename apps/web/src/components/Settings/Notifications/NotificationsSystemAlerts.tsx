"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";

type SystemAlertsConfig = {
  enabled: boolean;
  highLatencyEnabled: boolean;
  serviceUnreachableEnabled: boolean;
  indexersUnavailableEnabled: boolean;
  includeGlobalEndpoints: boolean;
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

export default function NotificationsSystemAlerts() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [users, setUsers] = useState<AlertUser[]>([]);
  const [form, setForm] = useState<SystemAlertsConfig>({
    enabled: true,
    highLatencyEnabled: true,
    serviceUnreachableEnabled: true,
    indexersUnavailableEnabled: true,
    includeGlobalEndpoints: true,
    targetUserIds: [],
    latencyThresholdMs: 40000,
    requestTimeoutMs: 45000,
    cooldownMs: 900000
  });

  useEffect(() => {
    let active = true;
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
          includeGlobalEndpoints: cfg?.includeGlobalEndpoints !== false,
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
    if (!form.includeGlobalEndpoints && form.targetUserIds.length === 0) {
      toast.error("Select at least one target user or enable global endpoints");
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

  if (loading) {
    return <div className="p-4">Loading system alerts settings...</div>;
  }

  const selectableUsers = users.filter((user) => !user.banned);
  const toggleUser = (userId: number) => {
    setForm((prev) => {
      const next = new Set(prev.targetUserIds);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return { ...prev, targetUserIds: Array.from(next) };
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">System Alerts</h2>
        <p className="text-gray-400">
          Configure health alert thresholds and cooldowns for Sonarr, Radarr, Prowlarr, and Jellyfin.
        </p>
      </div>

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

        <AnimatedCheckbox
          id="alerts-include-global"
          label="Send To Global Endpoints"
          description="Also deliver alerts to endpoints marked Global"
          checked={form.includeGlobalEndpoints}
          onChange={(e) => setForm((prev) => ({ ...prev, includeGlobalEndpoints: e.target.checked }))}
        />
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white">Target Users</h3>
          <p className="text-sm text-gray-400">Choose users to receive system alerts via their assigned notification channels.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {selectableUsers.map((user) => {
            const selected = form.targetUserIds.includes(user.id);
            const label = user.displayName || user.username;
            const channelCount = Array.isArray(user.notificationEndpointIds) ? user.notificationEndpointIds.length : 0;
            return (
              <label
                key={user.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  selected ? "border-indigo-500/50 bg-indigo-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{label}</div>
                  <div className="text-xs text-gray-400 truncate">@{user.username}</div>
                </div>
                <div className="flex items-center gap-3 ml-3">
                  <span className="text-xs text-gray-400">{channelCount} channel{channelCount === 1 ? "" : "s"}</span>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleUser(user.id)}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              </label>
            );
          })}
        </div>
      </div>

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

      <div className="flex gap-3">
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
