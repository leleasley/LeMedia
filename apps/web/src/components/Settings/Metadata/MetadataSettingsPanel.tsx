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
        <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-6 space-y-4">
            <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Providers</p>
                <h2 className="text-xl font-semibold text-white">Metadata Providers</h2>
                <p className="text-sm text-muted">
                    Control how metadata and imagery are sourced for discovery, requests, and search.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {items.map(item => (
                    <div key={item.label} className="rounded-md border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors">
                        <div className="text-xs uppercase tracking-wider text-muted font-semibold">{item.label}</div>
                        <div className="mt-1 text-sm font-semibold text-white break-words">{item.value}</div>
                        <p className="mt-1 text-xs text-muted">{item.help}</p>
                    </div>
                ))}
            </div>
            <div className="border-t border-white/10 pt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Calendar</p>
                <h3 className="text-lg font-semibold text-white">Calendar Feed</h3>
                <p className="text-sm text-muted mb-3">Your personal calendar feed URL for upcoming releases.</p>
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                    <code className="text-sm text-white break-all">
                        {feedData?.webcalUrl || "Loading..."}
                    </code>
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
                        className="btn"
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
                        className="btn"
                    >
                        Rotate Link
                    </button>
                </div>
            </div>
        </div>
    );
}
