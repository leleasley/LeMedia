"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff, Activity, BarChart3, ListChecks, Globe, Users, Lock } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";

interface PrivacySettings {
  profileVisibility: string;
  showActivity: boolean;
  showStats: boolean;
  showLists: boolean;
  showWatched: boolean;
}

export function ProfilePrivacySettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/social/profile", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setSettings({
          profileVisibility: data.profileVisibility ?? "public",
          showActivity: data.showActivity ?? true,
          showStats: data.showStats ?? true,
          showLists: data.showLists ?? true,
          showWatched: data.showWatched ?? true,
        });
      })
      .catch(() => toast.error("Failed to load privacy settings"))
      .finally(() => setLoading(false));
  }, [toast]);

  const save = async (updates: Partial<PrivacySettings>) => {
    if (!settings) return;
    const next = { ...settings, ...updates };
    setSettings(next);
    setSaving(true);
    try {
      const res = await csrfFetch("/api/v1/social/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Privacy settings updated");
    } catch {
      setSettings(settings);
      toast.error("Failed to save privacy settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!settings) return null;

  const toggles: Array<{
    key: keyof Pick<PrivacySettings, "showActivity" | "showStats" | "showLists" | "showWatched">;
    label: string;
    description: string;
    icon: typeof Eye;
  }> = [
    { key: "showActivity", label: "Activity", description: "Show your recent activity on your profile", icon: Activity },
    { key: "showStats", label: "Stats", description: "Show your media stats on your profile", icon: BarChart3 },
    { key: "showLists", label: "Lists", description: "Show your public lists on your profile", icon: ListChecks },
    { key: "showWatched", label: "Watched History", description: "Show your watched history on your profile", icon: Eye },
  ];

  const visibilityOptions: Array<{ value: string; label: string; description: string; icon: typeof Globe }> = [
    { value: "public", label: "Public", description: "Anyone can view your profile", icon: Globe },
    { value: "friends", label: "Friends Only", description: "Only friends can view your profile", icon: Users },
    { value: "private", label: "Private", description: "No one can view your profile", icon: Lock },
  ];

  return (
    <div className="space-y-6">
      {/* Profile Visibility */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h3 className="text-sm font-semibold text-white mb-1">Profile Visibility</h3>
        <p className="text-xs text-gray-400 mb-4">Control who can see your profile page</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {visibilityOptions.map((opt) => {
            const active = settings.profileVisibility === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => save({ profileVisibility: opt.value })}
                disabled={saving}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all text-left ${
                  active
                    ? "border-pink-500/50 bg-pink-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <opt.icon className={`w-5 h-5 mt-0.5 shrink-0 ${active ? "text-pink-400" : "text-gray-500"}`} />
                <div>
                  <span className={`text-sm font-medium ${active ? "text-white" : "text-gray-300"}`}>{opt.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section Toggles */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h3 className="text-sm font-semibold text-white mb-1">Profile Sections</h3>
        <p className="text-xs text-gray-400 mb-4">Choose which sections are visible on your profile</p>
        <div className="space-y-3">
          {toggles.map((toggle) => (
            <div
              key={toggle.key}
              className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <toggle.icon className="w-5 h-5 text-gray-400" />
                <div>
                  <span className="text-sm font-medium text-white">{toggle.label}</span>
                  <p className="text-xs text-gray-500">{toggle.description}</p>
                </div>
              </div>
              <button
                onClick={() => save({ [toggle.key]: !settings[toggle.key] })}
                disabled={saving}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  settings[toggle.key] ? "bg-pink-600" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    settings[toggle.key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
