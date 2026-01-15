"use client";

import useSettings from "@/hooks/useSettings";

export function MetadataSettingsPanel() {
    const { currentSettings } = useSettings();
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
        },
        {
            label: "Image caching",
            value: currentSettings.cacheImages ? "Enabled" : "Disabled",
            help: "Caches externally sourced images to improve performance."
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
        </div>
    );
}
