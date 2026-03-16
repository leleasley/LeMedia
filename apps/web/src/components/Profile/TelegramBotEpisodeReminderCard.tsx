"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/Providers/ToastProvider";

type LinkStatus = {
  linked: boolean;
  episodeReminderTelegramEnabled?: boolean;
};

const fetcher = (url: string) =>
  fetch(url, { credentials: "include", cache: "no-store" }).then((r) => r.json());

export function TelegramBotEpisodeReminderCard() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<LinkStatus>("/api/telegram/link", fetcher, {
    revalidateOnFocus: false,
  });
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!data) return;
    setEnabled(Boolean(data.episodeReminderTelegramEnabled ?? true));
  }, [data]);

  async function getCsrfToken(): Promise<string> {
    const res = await fetch("/api/csrf", { credentials: "include", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!token) throw new Error("Could not obtain CSRF token");
    return token;
  }

  async function handleSave() {
    if (saving || !data?.linked) return;
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
        body: JSON.stringify({ episodeReminderTelegramEnabled: enabled }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to save Telegram bot reminder preference");
      await mutate({ ...(data ?? { linked: false }), ...body }, { revalidate: false });
      toast.success(enabled ? "Telegram bot episode reminders enabled" : "Telegram bot episode reminders disabled");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update Telegram bot reminder preference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Telegram Bot Episode Reminders</h3>
          <p className="mt-1 text-xs text-gray-400">
            This only controls direct DMs from the LeMedia Telegram bot. Notification-channel delivery is configured separately in Profile Notifications.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isLoading || saving || !data?.linked}
          className="rounded-lg bg-[#229ED9] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1a8bc4] disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {!isLoading && !data?.linked ? (
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4 text-sm text-gray-300">
          Link your Telegram bot account first if you want direct bot DMs for episode reminders.
        </div>
      ) : null}

      <label className="flex items-start justify-between gap-4 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
        <div>
          <p className="text-sm font-medium text-white">Send episode reminders via Telegram bot</p>
          <p className="mt-1 text-xs text-gray-400">
            When enabled, the linked LeMedia Telegram bot chat will also receive episode reminder DMs.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={isLoading || saving || !data?.linked}
          onClick={() => setEnabled((prev) => !prev)}
          className={`ui-switch ui-switch-md shrink-0 transition-colors ${enabled ? "bg-[#229ED9]" : "bg-gray-700"} ${saving || !data?.linked ? "opacity-60" : ""}`}
        >
          <span className={`ui-switch-thumb ${enabled ? "translate-x-6" : "translate-x-0"}`} />
        </button>
      </label>
    </div>
  );
}