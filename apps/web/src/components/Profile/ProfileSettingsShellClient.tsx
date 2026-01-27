"use client";

import { ReactNode, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ProfileHeader } from "@/components/Profile/ProfileHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProfileSettingsShellClientProps {
  user: {
    username: string;
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

type SettingsTabKey = "general" | "security" | "linked" | "notifications" | "permissions";
type LegacyTabKey = SettingsTabKey | "password";

const tabOrder: Array<{ key: SettingsTabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "security", label: "Security" },
  { key: "linked", label: "Linked Accounts" },
  { key: "notifications", label: "Notifications" },
  { key: "permissions", label: "Permissions" }
];

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
        <div className="sm:hidden relative z-10">
          <label htmlFor="settings-tabs" className="sr-only">Select a tab</label>
          <Select value={activeTab} onValueChange={(value) => setTab(value as SettingsTabKey)}>
            <SelectTrigger className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white shadow-inner focus:border-indigo-500">
              <SelectValue placeholder="Select settings tab" />
            </SelectTrigger>
            <SelectContent>
              {tabOrder.map((tab) => (
                <SelectItem key={tab.key} value={tab.key}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden sm:block">
          <div className="hide-scrollbar overflow-x-auto border-b border-gray-600">
            <nav className="flex" aria-label="Profile settings">
              {tabOrder.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTab(tab.key)}
                    className={`whitespace-nowrap border-b-2 px-1 py-4 ml-8 text-sm font-medium leading-5 transition duration-300 first:ml-0 ${
                      isActive
                        ? "border-indigo-500 text-indigo-500"
                        : "border-transparent text-gray-500 hover:border-gray-400 hover:text-gray-300 focus:border-gray-400 focus:text-gray-300"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {tab.label}
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
