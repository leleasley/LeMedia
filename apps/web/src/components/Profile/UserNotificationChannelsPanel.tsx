"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { Link2, Mail } from "lucide-react";
import { Modal } from "@/components/Common/Modal";
import { ConfirmModal, useConfirm } from "@/components/Common/ConfirmModal";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { formatDate } from "@/lib/dateFormat";
import { swrFetcher } from "@/lib/swr-fetcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getNotificationProviderMeta,
  PERSONAL_NOTIFICATION_PROVIDERS,
} from "@/lib/notification-providers";

type EndpointType =
  | "telegram"
  | "discord"
  | "email"
  | "webhook"
  | "slack"
  | "gotify"
  | "ntfy"
  | "pushbullet"
  | "pushover";

type Endpoint = {
  id: number;
  name: string;
  type: EndpointType;
  enabled: boolean;
  is_global: boolean;
  owner_user_id: number | null;
  events: string[];
  config: Record<string, unknown>;
  created_at: string;
};

type FormState = {
  id?: number;
  name: string;
  type: EndpointType;
  enabled: boolean;
  events: string[];
  telegramBotToken: string;
  telegramChatId: string;
  discordWebhookUrl: string;
  slackWebhookUrl: string;
  emailTo: string;
  webhookUrl: string;
  gotifyBaseUrl: string;
  gotifyToken: string;
  ntfyTopic: string;
  ntfyBaseUrl: string;
  pushbulletAccessToken: string;
  pushoverApiToken: string;
  pushoverUserKey: string;
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
  { id: "request_new_season", label: "New season available" },
  { id: "issue_reported", label: "Issue reported" },
  { id: "issue_resolved", label: "Issue resolved" },
  { id: "review_mention", label: "Review mentions" },
  { id: "review_comment", label: "Review comments" },
  { id: "episode_air_reminder", label: "Episode air reminders" },
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
  "request_new_season",
  "issue_reported",
  "issue_resolved",
  "review_mention",
  "review_comment",
  "episode_air_reminder",
];

const initialForm: FormState = {
  name: "",
  type: "telegram",
  enabled: true,
  events: defaultEvents,
  telegramBotToken: "",
  telegramChatId: "",
  discordWebhookUrl: "",
  slackWebhookUrl: "",
  emailTo: "",
  webhookUrl: "",
  gotifyBaseUrl: "",
  gotifyToken: "",
  ntfyTopic: "",
  ntfyBaseUrl: "https://ntfy.sh",
  pushbulletAccessToken: "",
  pushoverApiToken: "",
  pushoverUserKey: "",
};

function providerMeta(type: EndpointType) {
  return getNotificationProviderMeta(type);
}

function ProviderIcon({
  provider,
  className = "h-5 w-5",
  forceLight = false,
}: {
  provider: ReturnType<typeof providerMeta>;
  className?: string;
  forceLight?: boolean;
}) {
  if (provider.iconKind === "image" && provider.iconPath) {
    return (
      <Image
        src={provider.iconPath}
        alt={provider.iconAlt}
        width={20}
        height={20}
        className={`${className}${forceLight ? " brightness-0 invert" : ""}`}
      />
    );
  }

  if (provider.iconKind === "mail") {
    return <Mail className={className} strokeWidth={1.9} />;
  }

  return <Link2 className={className} strokeWidth={1.9} />;
}

function resetForType(type: EndpointType, name: string, events: string[], enabled: boolean): FormState {
  return {
    ...initialForm,
    name,
    type,
    events,
    enabled,
  };
}

export function UserNotificationChannelsPanel() {
  const toast = useToast();
  const { confirm, modalProps } = useConfirm();

  const { data, mutate } = useSWR<{ endpoints: Endpoint[] }>(
    "/api/profile/notification-endpoints",
    swrFetcher,
    { revalidateOnFocus: false }
  );

  const endpoints = data?.endpoints ?? [];
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeProvider = providerMeta(form.type);
  const activeCount = endpoints.filter((endpoint) => endpoint.enabled).length;

  const selectedEventsLabel = useMemo(() => {
    if (form.events.length === 0) return "No events selected";
    if (form.events.length === EVENT_OPTIONS.length) return "All personal events selected";
    return `${form.events.length} event lanes active`;
  }, [form.events]);

  const eventLabelById = useMemo(
    () => Object.fromEntries(EVENT_OPTIONS.map((opt) => [opt.id, opt.label])),
    []
  );

  function resetForm() {
    setForm(initialForm);
    setError(null);
  }

  function openCreate() {
    setMode("create");
    resetForm();
    setOpen(true);
  }

  function openEdit(endpoint: Endpoint) {
    setMode("edit");
    setError(null);
    setForm({
      id: endpoint.id,
      name: endpoint.name,
      type: endpoint.type,
      enabled: endpoint.enabled,
      events: Array.isArray(endpoint.events) && endpoint.events.length ? endpoint.events : defaultEvents,
      telegramBotToken: String((endpoint.config?.botToken as string | undefined) ?? ""),
      telegramChatId: String((endpoint.config?.chatId as string | undefined) ?? ""),
      discordWebhookUrl: String((endpoint.config?.webhookUrl as string | undefined) ?? ""),
      slackWebhookUrl: String((endpoint.config?.webhookUrl as string | undefined) ?? ""),
      emailTo: String((endpoint.config?.to as string | undefined) ?? ""),
      webhookUrl: String((endpoint.config?.url as string | undefined) ?? ""),
      gotifyBaseUrl: String((endpoint.config?.baseUrl as string | undefined) ?? ""),
      gotifyToken: String((endpoint.config?.token as string | undefined) ?? ""),
      ntfyTopic: String((endpoint.config?.topic as string | undefined) ?? ""),
      ntfyBaseUrl: String((endpoint.config?.baseUrl as string | undefined) ?? "https://ntfy.sh"),
      pushbulletAccessToken: String((endpoint.config?.accessToken as string | undefined) ?? ""),
      pushoverApiToken: String((endpoint.config?.apiToken as string | undefined) ?? ""),
      pushoverUserKey: String((endpoint.config?.userKey as string | undefined) ?? ""),
    });
    setOpen(true);
  }

  function toggleEvent(eventId: string) {
    setForm((prev) => {
      const next = new Set(prev.events);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return { ...prev, events: Array.from(next) };
    });
  }

  function setType(type: EndpointType) {
    setForm((prev) => resetForType(type, prev.name, prev.events, prev.enabled));
  }

  function buildPayload() {
    const base = {
      name: form.name.trim(),
      type: form.type,
      enabled: form.enabled,
      events: form.events,
    } as Record<string, unknown>;

    if (form.type === "telegram") {
      base.botToken = form.telegramBotToken.trim();
      base.chatId = form.telegramChatId.trim();
    } else if (form.type === "discord") {
      base.webhookUrl = form.discordWebhookUrl.trim();
    } else if (form.type === "slack") {
      base.slackWebhookUrl = form.slackWebhookUrl.trim();
    } else if (form.type === "email") {
      base.to = form.emailTo.trim();
    } else if (form.type === "webhook") {
      base.url = form.webhookUrl.trim();
    } else if (form.type === "gotify") {
      base.baseUrl = form.gotifyBaseUrl.trim();
      base.token = form.gotifyToken.trim();
    } else if (form.type === "ntfy") {
      base.topic = form.ntfyTopic.trim();
      base.baseUrl = form.ntfyBaseUrl.trim() || "https://ntfy.sh";
    } else if (form.type === "pushbullet") {
      base.accessToken = form.pushbulletAccessToken.trim();
    } else if (form.type === "pushover") {
      base.apiToken = form.pushoverApiToken.trim();
      base.userKey = form.pushoverUserKey.trim();
    }

    return base;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = buildPayload();
      const response =
        mode === "create"
          ? await csrfFetch("/api/profile/notification-endpoints", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await csrfFetch(`/api/profile/notification-endpoints/${form.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Failed to save channel");

      await mutate();
      setOpen(false);
      resetForm();
      toast.success(mode === "create" ? "Channel created" : "Channel updated");
    } catch (err: any) {
      const message = err?.message ?? "Failed to save channel";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(endpoint: Endpoint) {
    const ok = await confirm(`Delete \"${endpoint.name}\"?`, {
      title: "Delete Channel",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    try {
      const response = await csrfFetch(`/api/profile/notification-endpoints/${endpoint.id}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Failed to delete channel");
      await mutate();
      toast.success("Channel deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete channel");
    }
  }

  async function handleTest(endpoint: Endpoint) {
    setTestingId(endpoint.id);
    try {
      const response = await csrfFetch(`/api/profile/notification-endpoints/${endpoint.id}/test`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Test failed");
      toast.success("Test notification sent");
    } catch (err: any) {
      toast.error(err?.message ?? "Test failed");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(217,70,239,0.18),transparent_32%),linear-gradient(140deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94),rgba(2,6,23,0.98))] p-6 md:p-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <ConfirmModal {...modalProps} />

      <div className="relative">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
            Personal Channels
          </div>
          <h3 className="mt-4 text-3xl font-bold text-white md:text-4xl">Design your own alert stack.</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Build personal delivery routes for requests, availability updates, reviews, issues, and episode reminders without waiting for an admin to wire them up.
          </p>
          </div>

          <div className="flex w-full flex-col gap-3 xl:w-auto xl:items-end">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-400/15 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25"
              onClick={openCreate}
            >
              Create new channel
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Channels</div>
            <div className="mt-2 text-2xl font-semibold text-white">{endpoints.length}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Active</div>
            <div className="mt-2 text-2xl font-semibold text-white">{activeCount}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Status</div>
            <div className="mt-2 text-sm font-semibold text-white">Your configured channels</div>
          </div>
        </div>
      </div>

      <div className="relative mt-8 grid gap-4 xl:grid-cols-2">
        {endpoints.map((endpoint) => {
          const meta = providerMeta(endpoint.type);
          const laneCount = endpoint.events.length || defaultEvents.length;
          return (
            <div
              key={endpoint.id}
              className="group rounded-[1.5rem] border border-white/10 bg-black/20 p-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur transition hover:border-white/20 hover:bg-black/25"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-black/20">
                      <ProviderIcon provider={meta} className="h-4 w-4" forceLight />
                    </span>
                    <span className="truncate">{endpoint.name}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-300">
                      {meta.label}
                    </span>
                    <span className="text-xs text-slate-400">{laneCount} events</span>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    endpoint.enabled
                      ? "border border-emerald-300/25 bg-emerald-500/15 text-emerald-100"
                      : "border border-white/15 bg-white/5 text-slate-300"
                  }`}
                >
                  {endpoint.enabled ? "Live" : "Paused"}
                </span>
              </div>

              <p className="mt-4 text-xs leading-5 text-slate-400">{meta.description}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {(endpoint.events.length ? endpoint.events : defaultEvents).slice(0, 4).map((eventId) => (
                  <span
                    key={eventId}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300"
                  >
                    {eventLabelById[eventId] ?? eventId}
                  </span>
                ))}
                {laneCount > 4 ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400">
                    +{laneCount - 4} more
                  </span>
                ) : null}
              </div>

              <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
                <div className="text-xs text-slate-500">Created {formatDate(endpoint.created_at)}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-white transition hover:bg-white/10"
                    onClick={() => handleTest(endpoint)}
                    disabled={testingId === endpoint.id}
                  >
                    {testingId === endpoint.id ? "Testing..." : "Test"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-white transition hover:bg-white/10"
                    onClick={() => openEdit(endpoint)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-lg border border-red-400/30 bg-red-500/10 px-3 text-xs text-red-200 transition hover:bg-red-500/20"
                    onClick={() => handleDelete(endpoint)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {endpoints.length === 0 ? (
          <div className="xl:col-span-2 rounded-[1.5rem] border border-dashed border-white/15 bg-black/15 px-6 py-12 text-center">
            <div className="mx-auto max-w-xl">
              <div className="text-sm uppercase tracking-[0.24em] text-slate-500">Nothing routed yet</div>
              <div className="mt-3 text-2xl font-semibold text-white">Create the first personal channel.</div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Pick a provider, choose the events you care about, and keep operational system alerts separate from personal media notifications.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={open}
        title={mode === "create" ? "Create channel" : "Edit channel"}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          {error ? (
            <div className="rounded-xl border border-red-300/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Channel name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Night Watch Alerts"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Provider</label>
              <Select value={form.type} onValueChange={(value) => setType(value as EndpointType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {PERSONAL_NOTIFICATION_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.type} value={provider.type}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${activeProvider.accent} px-4 py-4`}>
            <div className="flex items-center gap-3 text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/20">
                <ProviderIcon provider={activeProvider} className="h-5 w-5" forceLight />
              </div>
              <div>
                <div className="text-sm font-semibold">{activeProvider.label}</div>
                <div className="text-xs text-slate-200/80">{activeProvider.description}</div>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Channel enabled
          </label>

          <div className="space-y-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Event lanes</label>
              <div className="mt-1 text-xs text-slate-500">{selectedEventsLabel}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {EVENT_OPTIONS.map((opt) => {
                const selected = form.events.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleEvent(opt.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                      selected
                        ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-50"
                        : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {form.type === "telegram" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Bot token</label>
                <input
                  value={form.telegramBotToken}
                  onChange={(e) => setForm((prev) => ({ ...prev, telegramBotToken: e.target.value }))}
                  placeholder="123456:ABC..."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Chat ID</label>
                <input
                  value={form.telegramChatId}
                  onChange={(e) => setForm((prev) => ({ ...prev, telegramChatId: e.target.value }))}
                  placeholder="-100123456789"
                  required
                />
              </div>
            </div>
          ) : null}

          {form.type === "discord" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Discord webhook URL</label>
              <input
                value={form.discordWebhookUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, discordWebhookUrl: e.target.value }))}
                placeholder="https://discord.com/api/webhooks/..."
                required
              />
            </div>
          ) : null}

          {form.type === "slack" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Slack webhook URL</label>
              <input
                value={form.slackWebhookUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, slackWebhookUrl: e.target.value }))}
                placeholder="https://hooks.slack.com/services/..."
                required
              />
            </div>
          ) : null}

          {form.type === "email" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Email address</label>
              <input
                value={form.emailTo}
                onChange={(e) => setForm((prev) => ({ ...prev, emailTo: e.target.value }))}
                placeholder="you@example.com"
                required
              />
            </div>
          ) : null}

          {form.type === "webhook" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Webhook URL</label>
              <input
                value={form.webhookUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                placeholder="https://example.com/hook"
                required
              />
            </div>
          ) : null}

          {form.type === "gotify" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Base URL</label>
                <input
                  value={form.gotifyBaseUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, gotifyBaseUrl: e.target.value }))}
                  placeholder="https://gotify.example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">App token</label>
                <input
                  value={form.gotifyToken}
                  onChange={(e) => setForm((prev) => ({ ...prev, gotifyToken: e.target.value }))}
                  placeholder="token"
                  required
                />
              </div>
            </div>
          ) : null}

          {form.type === "ntfy" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Topic</label>
                <input
                  value={form.ntfyTopic}
                  onChange={(e) => setForm((prev) => ({ ...prev, ntfyTopic: e.target.value }))}
                  placeholder="my-private-topic"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Base URL</label>
                <input
                  value={form.ntfyBaseUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, ntfyBaseUrl: e.target.value }))}
                  placeholder="https://ntfy.sh"
                />
              </div>
            </div>
          ) : null}

          {form.type === "pushbullet" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Access token</label>
              <input
                value={form.pushbulletAccessToken}
                onChange={(e) => setForm((prev) => ({ ...prev, pushbulletAccessToken: e.target.value }))}
                placeholder="o.xxxxx"
                required
              />
            </div>
          ) : null}

          {form.type === "pushover" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">API token</label>
                <input
                  value={form.pushoverApiToken}
                  onChange={(e) => setForm((prev) => ({ ...prev, pushoverApiToken: e.target.value }))}
                  placeholder="application token"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">User key</label>
                <input
                  value={form.pushoverUserKey}
                  onChange={(e) => setForm((prev) => ({ ...prev, pushoverUserKey: e.target.value }))}
                  placeholder="user key"
                  required
                />
              </div>
            </div>
          ) : null}

          <button type="submit" disabled={saving} className="w-full btn btn-primary">
            {saving ? "Saving..." : mode === "create" ? "Create channel" : "Save changes"}
          </button>
        </form>
      </Modal>
    </div>
  );
}