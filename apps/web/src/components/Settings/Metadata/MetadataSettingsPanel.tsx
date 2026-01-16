"use client";

import useSWR from "swr";
import useSettings from "@/hooks/useSettings";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";

export function MetadataSettingsPanel() {
    const { currentSettings } = useSettings();
    const toast = useToast();
    const { data: feedData, mutate: mutateFeed } = useSWR<{ httpsUrl: string; webcalUrl: string }>(
        "/api/calendar/feed",
        (url: string) => fetch(url).then((res) => res.json())
    );
    const items = [
        {
            label: "Discover region",
            value: currentSettings.discoverRegion || "—",
            help: "Filters content by regional availability."
        },
        {
            label: "Streaming region",
            value: currentSettings.streamingRegion || "—",
            help: "Controls which streaming providers display."
        },
        {
            label: "YouTube base URL",
            value: currentSettings.youtubeUrl || "—",
            help: "Update this when using a self-hosted YouTube instance."
        }
    ];

    return (
        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/10 space-y-4">
            <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Metadata</p>
                <h2 className="text-xl font-semibold text-white">Metadata providers</h2>
                <p className="text-sm text-muted">
                    Control how metadata and imagery are sourced for discovery, requests, and search.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {items.map(item => (
                    <div key={item.label} className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
                        <div className="text-xs uppercase tracking-wider text-muted">{item.label}</div>
                        <div className="mt-2 text-sm font-semibold text-white break-words">{item.value}</div>
                        <p className="mt-2 text-xs text-muted">{item.help}</p>
                    </div>
                ))}
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
                <div className="text-xs uppercase tracking-wider text-muted">Calendar Feed</div>
                <div className="mt-2 text-sm font-semibold text-white break-words">
                    {feedData?.webcalUrl || "Loading..."}
                </div>
                <p className="mt-2 text-xs text-muted">
                    Rotate the per-user calendar feed link if it has been shared externally.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        onClick={async () => {
                            if (!feedData?.webcalUrl) return;
                            try {
                                await navigator.clipboard.writeText(feedData.webcalUrl);
                                toast.success("Calendar feed link copied");
                            } catch {
                                toast.error("Failed to copy calendar feed link");
                            }
                        }}
                        className="rounded-lg border border-white/10 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5 transition"
                    >
                        Copy Link
                    </button>
                    <button
                        onClick={async () => {
                            try {
                                const res = await csrfFetch("/api/calendar/feed", { method: "POST" });
                                if (!res.ok) {
                                    const data = await res.json().catch(() => ({}));
                                    throw new Error(data?.error || "Failed to rotate feed link");
                                }
                                await mutateFeed();
                                toast.success("Calendar feed link rotated");
                            } catch (error) {
                                toast.error("Failed to rotate feed link");
                            }
                        }}
                        className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 transition"
                    >
                        Rotate Link
                    </button>
                </div>
            </div>
        </div>
    );
}
