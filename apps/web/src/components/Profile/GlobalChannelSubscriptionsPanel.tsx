"use client";

import { useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { Link2, Mail, Cloud } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { swrFetcher } from "@/lib/swr-fetcher";
import { getNotificationProviderMeta } from "@/lib/notification-providers";

type GlobalEndpoint = {
  id: number;
  name: string;
  type: string;
  subscribed: boolean;
};

function ProviderIcon({ type, className = "h-4 w-4" }: { type: string; className?: string }) {
  const meta = getNotificationProviderMeta(type as any);
  if (meta.iconKind === "image" && meta.iconPath) {
    return (
      <Image
        src={meta.iconPath}
        alt={meta.iconAlt}
        width={16}
        height={16}
        className={`${className} brightness-0 invert`}
      />
    );
  }
  if (meta.iconKind === "mail") return <Mail className={className} strokeWidth={1.9} />;
  if (meta.iconKind === "webpush" || meta.iconKind === "webhook") return <Cloud className={className} strokeWidth={1.9} />;
  return <Link2 className={className} strokeWidth={1.9} />;
}

export function GlobalChannelSubscriptionsPanel() {
  const toast = useToast();
  const { data, mutate } = useSWR<{ endpoints: GlobalEndpoint[] }>(
    "/api/profile/global-channel-subscriptions",
    swrFetcher,
    { revalidateOnFocus: false }
  );
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const endpoints = data?.endpoints ?? [];
  const subscribedCount = endpoints.filter((ep) => ep.subscribed).length;

  async function toggle(endpoint: GlobalEndpoint) {
    setTogglingId(endpoint.id);
    try {
      const res = await csrfFetch(`/api/profile/global-channel-subscriptions/${endpoint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed: !endpoint.subscribed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to update subscription");
      await mutate();
      toast.success(endpoint.subscribed ? "Unsubscribed from channel" : "Subscribed to channel");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update subscription");
    } finally {
      setTogglingId(null);
    }
  }

  if (!data) {
    return (
      <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
        <p className="text-sm text-gray-400">Loading global channels...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-white/10">
          <span className="text-xl">📡</span>
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white">Global Channels</h3>
          <p className="text-sm text-gray-400 mt-1">
            Subscribe to admin-managed notification channels. When you&apos;re subscribed, delivery events will be routed to you through that channel.
          </p>
        </div>
        {subscribedCount > 0 && (
          <div className="rounded-full px-3 py-1 text-xs font-semibold bg-indigo-500/20 text-indigo-200">
            {subscribedCount} subscribed
          </div>
        )}
      </div>

      {endpoints.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-6 py-10 text-center">
          <p className="text-sm text-gray-400">No global channels available to subscribe to.</p>
          <p className="mt-1 text-xs text-gray-500">
            Ask an admin to create shared notification channels.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
          {endpoints.map((endpoint) => (
            <div
              key={endpoint.id}
              className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20">
                  <ProviderIcon type={endpoint.type} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{endpoint.name}</div>
                  <div className="text-xs text-gray-400 capitalize">{endpoint.type}</div>
                </div>
              </div>

              <button
                type="button"
                disabled={togglingId === endpoint.id}
                onClick={() => toggle(endpoint)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  endpoint.subscribed
                    ? "bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30"
                    : "bg-white/5 text-gray-300 hover:bg-white/10"
                }`}
              >
                {togglingId === endpoint.id
                  ? "Updating..."
                  : endpoint.subscribed
                  ? "Subscribed ✓"
                  : "Subscribe"}
              </button>
            </div>
          ))}
        </div>
      )}

      {endpoints.length > 0 && (
        <p className="mt-4 text-xs text-gray-500">
          You can unsubscribe at any time. Subscribing to a channel means the admin routing system may deliver
          notifications to that channel on your behalf when your account is targeted.
        </p>
      )}
    </div>
  );
}
