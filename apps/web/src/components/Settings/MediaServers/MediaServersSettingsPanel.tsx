"use client";

import { useState } from "react";
import { JellyfinSettingsPanel } from "./JellyfinSettingsPanel";
import { PlexSettingsPanel } from "./PlexSettingsPanel";

type TabType = "jellyfin" | "plex";

const tabs: { id: TabType; label: string; icon: React.ReactNode; description: string }[] = [
    {
        id: "jellyfin",
        label: "Jellyfin",
        icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
        ),
        description: "Open-source media server"
    },
    {
        id: "plex",
        label: "Plex",
        icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
            </svg>
        ),
        description: "Premium media server"
    }
];

export function MediaServersSettingsPanel() {
    const [activeTab, setActiveTab] = useState<TabType>("jellyfin");

    return (
        <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all
                            ${activeTab === tab.id
                                ? "bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-white border border-white/10 shadow-lg"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                            }
                        `}
                    >
                        <span className={activeTab === tab.id ? "text-purple-400" : "text-gray-500"}>
                            {tab.icon}
                        </span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="animate-in fade-in duration-200">
                {activeTab === "jellyfin" && <JellyfinSettingsPanel />}
                {activeTab === "plex" && <PlexSettingsPanel />}
            </div>
        </div>
    );
}
