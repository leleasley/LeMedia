"use client";

import { useState } from "react";
import Image from "next/image";
import { JellyfinSettingsPanel } from "./JellyfinSettingsPanel";
import { PlexSettingsPanel } from "./PlexSettingsPanel";
import PlexSmallLogo from "@/assets/services/plex.small.svg";

type TabType = "jellyfin" | "plex";

const tabs: { id: TabType; label: string; icon: React.ReactNode; description: string }[] = [
    {
        id: "jellyfin",
        label: "Jellyfin",
        icon: (
            <Image src="/images/jellyfin.svg" alt="Jellyfin" width={20} height={20} className="w-5 h-5" />
        ),
        description: "Open-source media server"
    },
    {
        id: "plex",
        label: "Plex",
        icon: (
            <Image src={PlexSmallLogo} alt="Plex" className="w-5 h-5" />
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
