"use client";

import { FormEvent, useMemo, useState, useCallback } from "react";
import { Modal } from "@/components/Common/Modal";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { formatDate } from "@/lib/dateFormat";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EndpointType = "telegram" | "discord" | "email" | "webhook";

type Endpoint = {
  id: number;
  name: string;
  type: EndpointType;
  enabled: boolean;
  is_global: boolean;
  events: string[];
  created_at: string;
};

type FormState = {
  id?: number;
  name: string;
  type: EndpointType;
  enabled: boolean;
  isGlobal: boolean;
  events: string[];
  telegramBotToken: string;
  telegramChatId: string;
  discordWebhookUrl: string;
  emailTo: string;
  webhookUrl: string;
};

const EVENT_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "request_pending", label: "Pending approval" },
  { id: "request_submitted", label: "Approved / submitted" },
  { id: "request_denied", label: "Denied" },
  { id: "request_failed", label: "Failed" },
  { id: "request_already_exists", label: "Already exists" },
  { id: "request_partially_available", label: "Partially available" },
  { id: "request_downloading", label: "Downloading" },
  { id: "request_available", label: "Available" },
  { id: "request_removed", label: "Removed" },
  { id: "issue_reported", label: "Issue reported" },
  { id: "issue_resolved", label: "Issue resolved" },
  { id: "system_alert_high_latency", label: "System alert: high latency" },
  { id: "system_alert_service_unreachable", label: "System alert: service unreachable" },
  { id: "system_alert_indexers_unavailable", label: "System alert: indexers unavailable" }
];

const defaultEvents = [
  "request_pending",
  "request_submitted",
  "request_denied",
  "request_failed",
  "request_already_exists",
  "request_partially_available",
  "request_downloading",
  "request_available",
  "request_removed",
  "issue_reported",
  "issue_resolved"
];

const initialForm: FormState = {
  name: "",
  type: "discord",
  enabled: true,
  isGlobal: false,
  events: defaultEvents,
  telegramBotToken: "",
  telegramChatId: "",
  discordWebhookUrl: "",
  emailTo: "",
  webhookUrl: ""
};

function formatEvents(events: string[]) {
  if (!events?.length) return "All";
  const labels = EVENT_OPTIONS.filter(e => events.includes(e.id)).map(e => e.label);
  return labels.length ? labels.join(", ") : events.join(", ");
}

export function NotificationEndpointsAdminPanel({ initialEndpoints }: { initialEndpoints: Endpoint[] }) {
  const toast = useToast();
  const [endpoints, setEndpoints] = useState<Endpoint[]>(initialEndpoints);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configHint = useMemo(() => {
    if (form.type === "telegram") return "Sends alert messages through this Telegram bot/chat whenever the selected events fire.";
    if (form.type === "discord") return "Sends alert messages through this Discord webhook whenever the selected events fire.";
    if (form.type === "email") return "Sends alerts to this address using the configured SMTP settings whenever the selected events fire.";
    return "POSTs a structured JSON payload to this webhook whenever the selected events fire.";
  }, [form.type]);

  const handleCloseModal = useCallback(() => {
    setOpen(false);
  }, []);

  const openCreate = () => {
    setMode("create");
    setForm(initialForm);
    setError(null);
    setOpen(true);
  };

  const openEdit = async (endpoint: Endpoint) => {
    setMode("edit");
    setError(null);
    setLoadingEdit(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/v1/notification-endpoints/${endpoint.id}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load endpoint");
      const full = body.endpoint as any;
      setForm({
        id: full.id,
        name: full.name ?? "",
        type: full.type,
        enabled: !!full.enabled,
        isGlobal: !!full.is_global,
        events: Array.isArray(full.events) && full.events.length ? full.events : defaultEvents,
        telegramBotToken: String(full.config?.botToken ?? ""),
        telegramChatId: String(full.config?.chatId ?? ""),
        discordWebhookUrl: String(full.config?.webhookUrl ?? ""),
        emailTo: String(full.config?.to ?? ""),
        webhookUrl: String(full.config?.url ?? "")
      });
    } catch (err: any) {
      setError(err?.message ?? "Failed to load endpoint");
    } finally {
      setLoadingEdit(false);
    }
  };

  const buildPayload = () => {
    const payload: any = {
      name: form.name.trim(),
      type: form.type,
      enabled: form.enabled,
      isGlobal: form.isGlobal,
      events: form.events
    };
    if (form.type === "telegram") {
      payload.botToken = form.telegramBotToken.trim();
      payload.chatId = form.telegramChatId.trim();
    } else if (form.type === "discord") {
      payload.webhookUrl = form.discordWebhookUrl.trim();
    } else if (form.type === "email") {
      payload.to = form.emailTo.trim();
    } else {
      payload.url = form.webhookUrl.trim();
    }
    return payload;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      const res =
        mode === "create"
          ? await csrfFetch("/api/v1/notification-endpoints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: "include"
          })
          : await csrfFetch(`/api/v1/notification-endpoints/${form.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, id: form.id }),
            credentials: "include"
          });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || (mode === "create" ? "Failed to create endpoint" : "Failed to update endpoint"));

      const updated = body.endpoint as Endpoint;
      setEndpoints(prev => {
        if (mode === "create") return [updated, ...prev];
        return prev.map(e => (e.id === updated.id ? updated : e));
      });
      toast.success(mode === "create" ? "Notification channel created" : "Notification channel updated");
      setOpen(false);
      setForm(initialForm);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to save endpoint";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (endpoint: Endpoint) => {
    if (!confirm(`Delete notification "${endpoint.name}"?`)) return;
    try {
      const res = await csrfFetch(`/api/v1/notification-endpoints/${endpoint.id}`, { method: "DELETE", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to delete");
      setEndpoints(prev => prev.filter(e => e.id !== endpoint.id));
      toast.success("Notification channel deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  };

  const handleTest = async (endpoint: Endpoint) => {
    toast.info("Sending test…", { timeoutMs: 1500 });
    try {
      const res = await csrfFetch(`/api/v1/notification-endpoints/${endpoint.id}/test`, { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Test failed");
      toast.success("Test notification sent");
    } catch (err: any) {
      toast.error(err?.message ?? "Test failed");
    }
  };

  const toggleEvent = (id: string) => {
    setForm(prev => {
      const set = new Set(prev.events);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, events: Array.from(set) };
    });
  };

  const setType = (type: EndpointType) => {
    setForm(prev => ({
      ...prev,
      type,
      telegramBotToken: "",
      telegramChatId: "",
      discordWebhookUrl: "",
      emailTo: "",
      webhookUrl: ""
    }));
  };

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/10 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Notifications</p>
          <div className="text-xl font-semibold text-white">Notification channels</div>
          <div className="text-sm text-muted">
            Create delivery-ready endpoints, mark broadcasts as global, and let users opt into the ones they care about.
          </div>
        </div>
        <button className="btn" onClick={openCreate}>
          New channel
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {endpoints.map(e => (
          <div
            key={e.id}
            className="rounded-lg border border-white/10 bg-slate-950/50 p-5 flex flex-col justify-between gap-4 hover:border-white/20 transition-colors"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-lg leading-tight text-white">{e.name}</h3>
                  <div className="text-xs font-medium uppercase tracking-wider opacity-60 mt-1">{e.type}</div>
                </div>
                <div className={`shrink-0 w-2 h-2 rounded-full mt-2 ${e.enabled ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-red-500/50"}`} title={e.enabled ? "Enabled" : "Disabled"} />
              </div>
              
              <div className="mt-4 space-y-2 text-sm text-muted">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${e.is_global ? "border-purple-500/30 bg-purple-500/10 text-purple-200" : "border-white/10 bg-white/5 text-muted"}`}>
                    {e.is_global ? "Global" : "Scoped"}
                  </span>
                  <span className="text-xs opacity-50">•</span>
                  <span className="text-xs opacity-70">{formatDate(e.created_at)}</span>
                </div>
                
                <div className="pt-2">
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-1">Trigger events</div>
                  <p className="text-xs leading-relaxed opacity-80 line-clamp-2" title={formatEvents(e.events)}>
                    {formatEvents(e.events)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
              <button className="btn btn-sm btn-ghost text-xs h-8" onClick={() => handleTest(e)}>
                Test
              </button>
              <button className="btn btn-sm btn-ghost text-xs h-8" onClick={() => openEdit(e)}>
                Edit
              </button>
              <button className="btn btn-sm btn-ghost text-xs h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => handleDelete(e)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {!endpoints.length ? (
          <div className="col-span-full rounded-lg border border-dashed border-white/10 p-12 text-center text-muted">
            No notification channels yet.
          </div>
        ) : null}
      </div>

      <Modal
        open={open}
        title={mode === "create" ? "Create notification channel" : "Edit notification channel"}
        onClose={handleCloseModal}
      >
        {loadingEdit ? <div className="py-8 text-sm text-muted">Loading…</div> : null}
        {!loadingEdit ? (
          <form className="space-y-3" onSubmit={handleSubmit}>
            {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Name</label>
              <input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Discord - Movies"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))} />
                Enabled
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <input type="checkbox" checked={form.isGlobal} onChange={e => setForm(prev => ({ ...prev, isGlobal: e.target.checked }))} />
                Global (broadcast)
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Events</label>
              <div className="grid gap-2">
                {EVENT_OPTIONS.map(opt => (
                  <label key={opt.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                    <span className="text-text">{opt.label}</span>
                    <input type="checkbox" checked={form.events.includes(opt.id)} onChange={() => toggleEvent(opt.id)} />
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Type</label>
              <Select value={form.type} onValueChange={(value) => setType(value as EndpointType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discord">Discord</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted">{configHint}</div>
            </div>

            {form.type === "discord" ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Webhook URL</label>
                <input
                  value={form.discordWebhookUrl}
                  onChange={e => setForm(prev => ({ ...prev, discordWebhookUrl: e.target.value }))}
                  placeholder="https://discord.com/api/webhooks/..."
                  required
                />
              </div>
            ) : null}

            {form.type === "telegram" ? (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Bot token</label>
                  <input
                    value={form.telegramBotToken}
                    onChange={e => setForm(prev => ({ ...prev, telegramBotToken: e.target.value }))}
                    placeholder="123456:ABC..."
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Chat id</label>
                  <input
                    value={form.telegramChatId}
                    onChange={e => setForm(prev => ({ ...prev, telegramChatId: e.target.value }))}
                    placeholder="-100123456789"
                    required
                  />
                </div>
              </>
            ) : null}

            {form.type === "email" ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">To address</label>
                <input
                  value={form.emailTo}
                  onChange={e => setForm(prev => ({ ...prev, emailTo: e.target.value }))}
                  placeholder="user@example.com"
                  required
                />
              </div>
            ) : null}

            {form.type === "webhook" ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">URL</label>
                <input
                  value={form.webhookUrl}
                  onChange={e => setForm(prev => ({ ...prev, webhookUrl: e.target.value }))}
                  placeholder="https://example.com/hook"
                  required
                />
              </div>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full btn"
            >
              {saving ? "Saving..." : mode === "create" ? "Create" : "Save changes"}
            </button>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
