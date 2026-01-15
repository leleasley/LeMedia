"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { RequestLimitSelector } from "@/components/Common/RequestLimitSelector";
import { AuthResetModal } from "@/components/Settings/Users/AuthResetModal";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface User {
    id: number;
    email: string;
    displayName: string;
    groups: string;
    isAdmin: boolean;
    createdAt: string;
    discordUserId: string | null;
    jellyfinUserId: string | null;
    jellyfinUsername: string | null;
    avatarUrl: string | null;
    requestLimitMovie: number | null;
    requestLimitMovieDays: number | null;
    requestLimitSeries: number | null;
    requestLimitSeriesDays: number | null;
}

type DefaultLimits = {
    movie: { limit: number; days: number };
    series: { limit: number; days: number };
};

export function UserGeneralSettingsClient() {
    const params = useParams();
    const userId = params?.id;
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [resettingMfa, setResettingMfa] = useState(false);

    const { data: user, error, mutate } = useSWR<User>(userId ? `/api/v1/admin/users/${userId}` : null);
    const { data: defaultLimits } = useSWR<DefaultLimits>("/api/v1/admin/settings/users");

    const [formData, setFormData] = useState({
        displayName: "",
        email: "",
        discordUserId: "",
        groups: "",
        isJellyfinUser: false,
    });
    const [limitsInitialized, setLimitsInitialized] = useState(false);
    const [requestLimits, setRequestLimits] = useState({
        movieOverride: false,
        movieLimit: 0,
        movieDays: 7,
        seriesOverride: false,
        seriesLimit: 0,
        seriesDays: 7
    });

    // Update form when user data loads
    useEffect(() => {
        if (user) {
            setFormData({
                displayName: user.displayName || "",
                email: user.email || "",
                discordUserId: user.discordUserId || "",
                groups: user.groups || "",
                isJellyfinUser: !!user.jellyfinUserId,
            });
        }
    }, [user]);

    useEffect(() => {
        setLimitsInitialized(false);
    }, [userId]);

    useEffect(() => {
        if (!user || limitsInitialized) return;
        const hasMovieOverride =
            user.requestLimitMovie !== null || user.requestLimitMovieDays !== null;
        const hasSeriesOverride =
            user.requestLimitSeries !== null || user.requestLimitSeriesDays !== null;

        setRequestLimits({
            movieOverride: hasMovieOverride,
            movieLimit: user.requestLimitMovie ?? (defaultLimits?.movie.limit ?? 0),
            movieDays: user.requestLimitMovieDays ?? (defaultLimits?.movie.days ?? 7),
            seriesOverride: hasSeriesOverride,
            seriesLimit: user.requestLimitSeries ?? (defaultLimits?.series.limit ?? 0),
            seriesDays: user.requestLimitSeriesDays ?? (defaultLimits?.series.days ?? 7)
        });
        setLimitsInitialized(true);
    }, [user, defaultLimits, limitsInitialized]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await csrfFetch(`/api/v1/admin/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    displayName: formData.displayName,
                    email: formData.email,
                    discordUserId: formData.discordUserId,
                    groups: formData.groups,
                    requestLimitMovie: requestLimits.movieOverride ? requestLimits.movieLimit : null,
                    requestLimitMovieDays: requestLimits.movieOverride ? requestLimits.movieDays : null,
                    requestLimitSeries: requestLimits.seriesOverride ? requestLimits.seriesLimit : null,
                    requestLimitSeriesDays: requestLimits.seriesOverride ? requestLimits.seriesDays : null
                }),
            });
            if (res.ok) {
                mutate();
                toast.success("Settings saved successfully!");
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to save settings");
            }
        } catch (error) {
            console.error("Error saving settings:", error);
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const handleResetMfa = async () => {
        if (!confirm("Are you sure you want to reset MFA for this user?")) {
            return;
        }

        setResettingMfa(true);
        try {
            const res = await fetch(`/api/v1/admin/users/${userId}/reset-mfa`, {
                method: "POST",
            });
            if (res.ok) {
                toast.success("MFA reset successfully!");
            } else {
                toast.error("Failed to reset MFA");
            }
        } catch (error) {
            console.error("Error resetting MFA:", error);
            toast.error("Failed to reset MFA");
        } finally {
            setResettingMfa(false);
        }
    };

    if (error) {
        return (
            <div className="p-8 text-center text-red-500">
                Failed to load user settings
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
            </div>
        );
    }

    const defaultMovieLimit = defaultLimits?.movie.limit ?? 0;
    const defaultMovieDays = defaultLimits?.movie.days ?? 7;
    const defaultSeriesLimit = defaultLimits?.series.limit ?? 0;
    const defaultSeriesDays = defaultLimits?.series.days ?? 7;

    const effectiveMovieLimit = requestLimits.movieOverride ? requestLimits.movieLimit : defaultMovieLimit;
    const effectiveMovieDays = requestLimits.movieOverride ? requestLimits.movieDays : defaultMovieDays;
    const effectiveSeriesLimit = requestLimits.seriesOverride ? requestLimits.seriesLimit : defaultSeriesLimit;
    const effectiveSeriesDays = requestLimits.seriesOverride ? requestLimits.seriesDays : defaultSeriesDays;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-white mb-1">General Settings</h3>
                <p className="text-sm text-gray-400">Manage basic user information and account settings</p>
            </div>

            <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6 space-y-6">
                {/* Display Name */}
                <div>
                    <label className="block text-sm font-medium text-white mb-2">Display Name</label>
                    <input
                        type="text"
                        value={formData.displayName}
                        onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter display name"
                    />
                </div>

                {/* Email */}
                <div>
                    <label className="block text-sm font-medium text-white mb-2">Email Address</label>
                    <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter email address"
                    />
                </div>

                {/* Discord User ID */}
                <div>
                    <label className="block text-sm font-medium text-white mb-2">Discord User ID</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={formData.discordUserId}
                        onChange={(e) => setFormData({ ...formData, discordUserId: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter Discord User ID"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                        Optional. Used to auto-fill Discord notification mentions.
                    </p>
                </div>

                {/* Groups */}
                <div>
                    <label className="block text-sm font-medium text-white mb-2">Groups</label>
                    <input
                        type="text"
                        value={formData.groups}
                        onChange={(e) => setFormData({ ...formData, groups: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g., admins, users (comma-separated)"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                        Comma-separated list of groups. Add &quot;admins&quot; to grant admin privileges.
                    </p>
                </div>

                {/* Account Type */}
                <div>
                    <label className="block text-sm font-medium text-white mb-2">Account Type</label>
                    <Select
                        value={formData.isJellyfinUser ? "jellyfin" : "local"}
                        onValueChange={(value) => setFormData({ ...formData, isJellyfinUser: value === "jellyfin" })}
                        disabled={user?.id === 1}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select account type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="local">Local User</SelectItem>
                            <SelectItem value="jellyfin">Jellyfin User</SelectItem>
                        </SelectContent>
                    </Select>
                    {user?.id === 1 && (
                        <p className="mt-1 text-xs text-gray-400">
                            Owner account type cannot be changed
                        </p>
                    )}
                </div>

                {/* Role */}
                <div>
                    <label className="block text-sm font-medium text-white mb-2">Role</label>
                    <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-400">
                        {user.id === 1 ? "Owner" : user.isAdmin ? "Admin" : "User"}
                    </div>
                </div>

                {/* Request Limits */}
                <div className="border-t border-white/10 pt-6 space-y-4">
                    <div>
                        <h4 className="text-md font-semibold text-white mb-1">Request Limits</h4>
                        <p className="text-sm text-gray-400">
                            Override global request limits for this user.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white mb-2">Movie Requests</label>
                        <div className="space-y-3">
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={!requestLimits.movieOverride}
                                    onChange={(e) => {
                                        const useDefault = e.target.checked;
                                        setRequestLimits((prev) => ({
                                            ...prev,
                                            movieOverride: !useDefault,
                                            movieLimit: useDefault
                                                ? prev.movieLimit
                                                : Math.max(prev.movieLimit || defaultMovieLimit, 1),
                                            movieDays: useDefault
                                                ? prev.movieDays
                                                : Math.max(prev.movieDays || defaultMovieDays, 1)
                                        }));
                                    }}
                                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                                />
                                Use global defaults
                            </label>
                            <RequestLimitSelector
                                limit={effectiveMovieLimit}
                                days={effectiveMovieDays}
                                disabled={!requestLimits.movieOverride}
                                onChange={(limit, days) => {
                                    setRequestLimits((prev) => ({
                                        ...prev,
                                        movieOverride: true,
                                        movieLimit: limit,
                                        movieDays: days
                                    }));
                                }}
                            />
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                            Default: {defaultMovieLimit === 0 ? "Unlimited" : `${defaultMovieLimit} per ${defaultMovieDays} days`}
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white mb-2">Series Requests</label>
                        <div className="space-y-3">
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={!requestLimits.seriesOverride}
                                    onChange={(e) => {
                                        const useDefault = e.target.checked;
                                        setRequestLimits((prev) => ({
                                            ...prev,
                                            seriesOverride: !useDefault,
                                            seriesLimit: useDefault
                                                ? prev.seriesLimit
                                                : Math.max(prev.seriesLimit || defaultSeriesLimit, 1),
                                            seriesDays: useDefault
                                                ? prev.seriesDays
                                                : Math.max(prev.seriesDays || defaultSeriesDays, 1)
                                        }));
                                    }}
                                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                                />
                                Use global defaults
                            </label>
                            <RequestLimitSelector
                                limit={effectiveSeriesLimit}
                                days={effectiveSeriesDays}
                                disabled={!requestLimits.seriesOverride}
                                onChange={(limit, days) => {
                                    setRequestLimits((prev) => ({
                                        ...prev,
                                        seriesOverride: true,
                                        seriesLimit: limit,
                                        seriesDays: days
                                    }));
                                }}
                            />
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                            Default: {defaultSeriesLimit === 0 ? "Unlimited" : `${defaultSeriesLimit} per ${defaultSeriesDays} days`}
                        </p>
                    </div>
                </div>

                {/* Auth Reset */}
                <div className="border-t border-white/10 pt-6">
                    <h4 className="text-md font-semibold text-white mb-2">Authentication Management</h4>
                    <p className="text-sm text-gray-400 mb-4">
                        Reset authentication methods if the user has lost access or for security reasons.
                    </p>
                    <button
                        onClick={() => setResettingMfa(true)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                    >
                        Manage Authentication
                    </button>
                    {user && (
                        <AuthResetModal 
                            userId={user.id} 
                            isOpen={resettingMfa} 
                            onClose={() => setResettingMfa(false)} 
                        />
                    )}
                </div>

                {/* Save Button */}
                <div className="border-t border-white/10 pt-6 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
