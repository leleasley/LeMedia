"use client";

import { ReactNode, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ProfileHeader } from "@/components/Profile/ProfileHeader";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { Bell, Eye, Key, Link2, Lock, Send, User } from "lucide-react";

interface ProfileSettingsShellClientProps {
  user: {
    username: string;
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    jellyfinUserId?: string | null;
    createdAt?: string;
    userId?: number;
    groups?: string[];
  };
  isAdmin: boolean;
  children: ReactNode;
}

type SettingsTabKey = "general" | "security" | "linked" | "notifications" | "permissions" | "privacy" | "bot";
type LegacyTabKey = SettingsTabKey | "password";

const tabOrder: Array<{ key: SettingsTabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "security", label: "Security" },
  { key: "linked", label: "Linked Accounts" },
  { key: "notifications", label: "Notifications" },
  { key: "permissions", label: "Permissions" },
  { key: "privacy", label: "Privacy" },
  { key: "bot", label: "Telegram Bot" }
];

const TAB_ICONS: Record<SettingsTabKey, ReactNode> = {
  general: <User className="w-[15px] h-[15px] shrink-0" />,
  security: <Lock className="w-[15px] h-[15px] shrink-0" />,
  linked: <Link2 className="w-[15px] h-[15px] shrink-0" />,
  notifications: <Bell className="w-[15px] h-[15px] shrink-0" />,
  permissions: <Key className="w-[15px] h-[15px] shrink-0" />,
  privacy: <Eye className="w-[15px] h-[15px] shrink-0" />,
  bot: <Send className="w-[15px] h-[15px] shrink-0" />,
};

export function ProfileSettingsShellClient({ user, isAdmin, children }: ProfileSettingsShellClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = useMemo<SettingsTabKey>(() => {
    const lastSegment = pathname?.split("/").filter(Boolean).pop();
    const normalized = (lastSegment === "password" ? "security" : lastSegment) as LegacyTabKey;
    const match = tabOrder.find(tab => tab.key === normalized);
    return match?.key ?? "general";
  }, [pathname]);

  const setTab = (nextTab: SettingsTabKey) => {
    if (nextTab === activeTab) return;
    router.push(`/settings/profile/${nextTab}`, { scroll: false });
  };

  return (
    <div className="min-h-screen">
      <ProfileHeader user={user} isSettingsPage={true} isAdmin={isAdmin} />

      <div className="mt-6">
        {/* Mobile dropdown */}
        <div className="sm:hidden relative z-10 px-4 pb-2">
          <label htmlFor="settings-tabs" className="sr-only">Select a tab</label>
          <AdaptiveSelect
            value={activeTab}
            onValueChange={(value) => setTab(value as SettingsTabKey)}
            options={tabOrder.map((tab) => ({ value: tab.key, label: tab.label }))}
            placeholder="Select settings tab"
            id="settings-tabs"
            triggerClassName="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white shadow-inner focus:border-indigo-500"
          />
        </div>

        {/* Desktop tab bar */}
        <div className="hidden sm:block">
          <div className="hide-scrollbar overflow-x-auto border-b border-white/[0.08] bg-black/20">
            <nav className="flex items-center gap-0.5 px-4 min-w-max" aria-label="Profile settings">
              {tabOrder.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTab(tab.key)}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 my-2 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25 shadow-sm"
                        : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {TAB_ICONS[tab.key]}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
