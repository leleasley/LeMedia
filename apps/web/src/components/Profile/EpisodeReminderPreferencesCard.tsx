"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/Providers/ToastProvider";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

type LinkStatus = {
  linked: boolean;
  followedMediaNotifications?: boolean;
  episodeReminderEnabled?: boolean;
  episodeReminderPrimaryMinutes?: number;
  episodeReminderSecondEnabled?: boolean;
  episodeReminderSecondMinutes?: number;
  reminderTimezone?: string | null;
};

type ReminderDeliveryItem = {
  id: number;
  endpointId: number;
  endpointName: string;
  channel: string;
  status: "success" | "failure" | "skipped";
  attemptNumber: number;
  errorMessage: string | null;
  createdAt: string;
};

type ReminderDeliveryResponse = {
  items: ReminderDeliveryItem[];
};

function getSupportedTimezones(): string[] {
  try {
    const values = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (Array.isArray(values) && values.length > 0) {
      return values;
    }
  } catch {
    // Ignore and return fallback.
  }
  return [
    "UTC",
    "Europe/London",
    "Europe/Dublin",
    "Europe/Paris",
    "Europe/Berlin",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Australia/Sydney",
    "Asia/Tokyo",
  ];
}

function isValidClientTimezone(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return true;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function formatDeliveryTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include", cache: "no-store" }).then((r) => r.json());

export function EpisodeReminderPreferencesCard() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<LinkStatus>("/api/telegram/link", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: deliveryData, isLoading: deliveryLoading, mutate: mutateDeliveries } = useSWR<ReminderDeliveryResponse>(
    "/api/profile/episode-reminder-deliveries?limit=10",
    fetcher,
    { revalidateOnFocus: false }
  );

  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [primaryMinutes, setPrimaryMinutes] = useState(1440);
  const [secondEnabled, setSecondEnabled] = useState(true);
  const [secondMinutes, setSecondMinutes] = useState(60);
  const [timezoneDraft, setTimezoneDraft] = useState<string | null>(null);
  const [timezoneFilter, setTimezoneFilter] = useState("");

  const allTimezones = getSupportedTimezones();

  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form field initialization from SWR data; useSWR onSuccess would have identical semantics
    setEnabled(Boolean(data.episodeReminderEnabled ?? true));
    setPrimaryMinutes(Math.max(1, Number(data.episodeReminderPrimaryMinutes ?? 1440) || 1440));
    setSecondEnabled(Boolean(data.episodeReminderSecondEnabled ?? true));
    setSecondMinutes(Math.max(1, Number(data.episodeReminderSecondMinutes ?? 60) || 60));
    setTimezoneDraft(data.reminderTimezone ?? "");
  }, [data]);

  async function getCsrfToken(): Promise<string> {
    const res = await fetch("/api/csrf", { credentials: "include", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!token) throw new Error("Could not obtain CSRF token");
    return token;
  }

  function splitDuration(totalMinutes: number): { days: number; hours: number; minutes: number } {
    const safe = Math.max(1, Math.floor(totalMinutes));
    const days = Math.floor(safe / 1440);
    const remAfterDays = safe % 1440;
    const hours = Math.floor(remAfterDays / 60);
    const minutes = remAfterDays % 60;
    return { days, hours, minutes };
  }

  function combineDuration(days: number, hours: number, minutes: number): number {
    const d = Math.max(0, Math.floor(days || 0));
    const h = Math.max(0, Math.floor(hours || 0));
    const m = Math.max(0, Math.floor(minutes || 0));
    return d * 1440 + h * 60 + m;
  }

  async function handleSave() {
    if (saving) return;
    const normalizedPrimary = Math.min(Math.max(Math.floor(primaryMinutes), 1), 43200);
    const normalizedSecond = Math.min(Math.max(Math.floor(secondMinutes), 1), 43200);
    const trimmedTimezone = String(timezoneDraft ?? "").trim();
    if (trimmedTimezone && !isValidClientTimezone(trimmedTimezone)) {
      toast.error("Please pick a valid timezone before saving");
      return;
    }

    setSaving(true);
    try {
      const token = await getCsrfToken();
      const res = await fetch("/api/telegram/link", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({
          episodeReminderEnabled: enabled,
          episodeReminderPrimaryMinutes: normalizedPrimary,
          episodeReminderSecondEnabled: secondEnabled,
          episodeReminderSecondMinutes: normalizedSecond,
          reminderTimezone: trimmedTimezone.length ? trimmedTimezone : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to save preference");

      await mutate({ ...(data ?? { linked: false }), ...body }, { revalidate: false });
      toast.success("Episode reminder preferences updated");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update reminder preferences");
    } finally {
      setSaving(false);
    }
  }

  const timezoneValue = timezoneDraft ?? "";
  const timezoneIsValid = isValidClientTimezone(timezoneValue);
  const filteredTimezones = allTimezones
    .filter((zone) => zone.toLowerCase().includes(timezoneFilter.toLowerCase().trim()))
    .slice(0, 120);
  const recentDeliveries = deliveryData?.items ?? [];
  const primary = splitDuration(primaryMinutes);
  const secondary = splitDuration(secondMinutes);

  return (
    <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 ring-1 ring-white/10">
            <span className="text-xl">🗓</span>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Episode Reminder Timing</h3>
            <p className="mt-1 text-sm text-gray-400">
              Configure reminder offsets delivered through your notification channels
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isLoading || saving}
          className="rounded-lg bg-[#229ED9] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1a8bc4] disabled:opacity-60 shrink-0"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>

      <div className="space-y-4">
          <label className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/25 p-4">
            <div>
              <p className="text-sm font-medium text-white">Episode reminders enabled</p>
              <p className="text-xs text-gray-400 mt-1">Turn all episode reminder notifications on or off.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={saving || isLoading}
              onClick={() => setEnabled((prev) => !prev)}
              className={`ui-switch ui-switch-md shrink-0 transition-colors ${enabled ? "bg-[#229ED9]" : "bg-gray-700"} ${saving ? "opacity-60" : ""}`}
            >
              <span className={`ui-switch-thumb ${enabled ? "translate-x-6" : "translate-x-0"}`} />
            </button>
          </label>

          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <div>
              <p className="text-sm font-medium text-white">Notify once before</p>
              <p className="text-xs text-gray-400 mt-1">Set the lead time for your primary reminder.</p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Days</span>
                <input
                  type="number"
                  min={0}
                  value={primary.days}
                  onChange={(event) => setPrimaryMinutes(combineDuration(Number(event.target.value), primary.hours, primary.minutes))}
                  className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-[#229ED9]"
                  placeholder="0"
                  disabled={saving || isLoading}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Hours</span>
                <input
                  type="number"
                  min={0}
                  value={primary.hours}
                  onChange={(event) => setPrimaryMinutes(combineDuration(primary.days, Number(event.target.value), primary.minutes))}
                  className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-[#229ED9]"
                  placeholder="0"
                  disabled={saving || isLoading}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Minutes</span>
                <input
                  type="number"
                  min={0}
                  value={primary.minutes}
                  onChange={(event) => setPrimaryMinutes(combineDuration(primary.days, primary.hours, Number(event.target.value)))}
                  className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-[#229ED9]"
                  placeholder="0"
                  disabled={saving || isLoading}
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Current primary offset: {primary.days} day{primary.days === 1 ? "" : "s"}, {primary.hours} hour{primary.hours === 1 ? "" : "s"}, {primary.minutes} minute{primary.minutes === 1 ? "" : "s"}
            </p>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/25 p-4">
            <div>
              <p className="text-sm font-medium text-white">Notify twice</p>
              <p className="text-xs text-gray-400 mt-1">Enable a second reminder with its own lead time.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={secondEnabled}
              disabled={saving || isLoading}
              onClick={() => setSecondEnabled((prev) => !prev)}
              className={`ui-switch ui-switch-md shrink-0 transition-colors ${secondEnabled ? "bg-[#229ED9]" : "bg-gray-700"} ${saving ? "opacity-60" : ""}`}
            >
              <span className={`ui-switch-thumb ${secondEnabled ? "translate-x-6" : "translate-x-0"}`} />
            </button>
          </label>

          {secondEnabled ? (
            <div className="rounded-xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm font-medium text-white">Second reminder offset</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Days</span>
                  <input
                    type="number"
                    min={0}
                    value={secondary.days}
                    onChange={(event) => setSecondMinutes(combineDuration(Number(event.target.value), secondary.hours, secondary.minutes))}
                    className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-[#229ED9]"
                    placeholder="0"
                    disabled={saving || isLoading}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Hours</span>
                  <input
                    type="number"
                    min={0}
                    value={secondary.hours}
                    onChange={(event) => setSecondMinutes(combineDuration(secondary.days, Number(event.target.value), secondary.minutes))}
                    className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-[#229ED9]"
                    placeholder="0"
                    disabled={saving || isLoading}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Minutes</span>
                  <input
                    type="number"
                    min={0}
                    value={secondary.minutes}
                    onChange={(event) => setSecondMinutes(combineDuration(secondary.days, secondary.hours, Number(event.target.value)))}
                    className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-[#229ED9]"
                    placeholder="0"
                    disabled={saving || isLoading}
                  />
                </label>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Current second offset: {secondary.days} day{secondary.days === 1 ? "" : "s"}, {secondary.hours} hour{secondary.hours === 1 ? "" : "s"}, {secondary.minutes} minute{secondary.minutes === 1 ? "" : "s"}
              </p>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <label htmlFor="episode-reminder-timezone" className="block text-sm font-medium text-white">
              Reminder timezone
            </label>
            <p className="mt-1 text-xs text-gray-400">
              Search and select an IANA timezone. Leave blank to use the app default.
            </p>
            <div className="mt-3 space-y-2">
              <input
                id="episode-reminder-timezone-search"
                type="text"
                value={timezoneFilter}
                onChange={(event) => setTimezoneFilter(event.target.value)}
                placeholder="Search timezone (e.g. london, new york, tokyo)"
                className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-[#229ED9]"
                disabled={isLoading || saving}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                <AdaptiveSelect
                  id="episode-reminder-timezone"
                  value={timezoneValue}
                  onValueChange={(value) => setTimezoneDraft(value)}
                  options={[
                    { value: "", label: "Use app default timezone" },
                    ...filteredTimezones.map((zone) => ({ value: zone, label: zone }))
                  ]}
                  triggerClassName="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-[#229ED9]"
                  disabled={isLoading || saving}
                />
                <button
                  type="button"
                  onClick={() => {
                    const detected = String(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "").trim();
                    if (!detected) {
                      toast.error("Could not auto-detect timezone on this device");
                      return;
                    }
                    setTimezoneDraft(detected);
                    setTimezoneFilter(detected);
                    toast.success(`Detected timezone: ${detected}`);
                  }}
                  disabled={isLoading || saving}
                  className="rounded-lg border border-white/20 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.1] disabled:opacity-60"
                >
                  Auto-detect
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isLoading || saving}
                  className="rounded-lg border border-[#229ED9]/40 bg-[#229ED9] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1a8bc4] disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <p className={`mt-2 text-xs ${timezoneIsValid ? "text-emerald-300" : "text-rose-300"}`}>
              {timezoneValue.length === 0
                ? "No timezone selected. The app default timezone will be used."
                : timezoneIsValid
                ? `Timezone looks valid: ${timezoneValue}`
                : "Timezone is not valid. Choose from the dropdown or use auto-detect."}
            </p>

            <p className="mt-2 text-xs text-gray-500">
              These reminders are sent through your configured notification channels for the episode reminder event type, such as Discord, Telegram notification endpoints, Slack, email, webhook, and similar providers.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Recent reminder deliveries</p>
                <p className="mt-1 text-xs text-gray-400">Last 10 endpoint attempts for episode reminders.</p>
              </div>
              <button
                type="button"
                onClick={() => void mutateDeliveries()}
                className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.1]"
              >
                Refresh history
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {deliveryLoading ? (
                <div className="text-xs text-gray-400">Loading delivery history...</div>
              ) : recentDeliveries.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3 text-xs text-gray-400">
                  No delivery attempts recorded yet for episode reminders.
                </div>
              ) : (
                recentDeliveries.map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-white">{item.endpointName}</span>
                      <span
                        className={`rounded px-2 py-0.5 ${
                          item.status === "success"
                            ? "bg-emerald-500/20 text-emerald-200"
                            : item.status === "failure"
                            ? "bg-rose-500/20 text-rose-200"
                            : "bg-amber-500/20 text-amber-200"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {item.channel} • attempt #{item.attemptNumber} • {formatDeliveryTimestamp(item.createdAt)}
                    </div>
                    {item.errorMessage ? <div className="mt-1 text-xs text-rose-300">{item.errorMessage}</div> : null}
                  </div>
                ))
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
