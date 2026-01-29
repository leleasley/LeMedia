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

type UserSessionRow = {
    jti: string;
    expiresAt: string;
    revokedAt: string | null;
    lastSeenAt: string | null;
    userAgent?: string | null;
    deviceLabel?: string | null;
    ipAddress?: string | null;
};

type UserSessionsResponse = {
    userId: number;
    sessions: UserSessionRow[];
};

export function UserGeneralSettingsClient() {
    const params = useParams();
    const userId = params?.id;
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [resettingMfa, setResettingMfa] = useState(false);
    const [revokingSession, setRevokingSession] = useState<string | null>(null);
    const [deletingSession, setDeletingSession] = useState<string | null>(null);
    const [revokingAll, setRevokingAll] = useState(false);

    const { data: user, error, mutate } = useSWR<User>(userId ? `/api/v1/admin/users/${userId}` : null);
    const { data: defaultLimits } = useSWR<DefaultLimits>("/api/v1/admin/settings/users");
    const { data: sessionsData, mutate: mutateSessions } = useSWR<UserSessionsResponse>(
        userId ? `/api/v1/admin/users/${userId}/sessions` : null
    );

    const [formData, setFormData] = useState({
        displayName: "",
        email: "",
        discordUserId: "",
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

    const formatWhen = (value: string | null) => {
        if (!value) return "Never";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Unknown";
        return date.toLocaleString();
    };

    const revokeSession = async (jti: string) => {
        if (!userId) return;
        setRevokingSession(jti);
        try {
            const res = await csrfFetch(`/api/v1/admin/users/${userId}/sessions`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jti })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || "Failed to revoke session");
            }
            toast.success("Session revoked");
            mutateSessions();
        } catch (err: any) {
            toast.error(err?.message || "Failed to revoke session");
        } finally {
            setRevokingSession(null);
        }
    };

    const revokeAllSessions = async () => {
        if (!userId) return;
        setRevokingAll(true);
        try {
            const res = await csrfFetch(`/api/v1/admin/users/${userId}/logout-sessions`, {
                method: "POST",
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || "Failed to revoke sessions");
            }
            toast.success("All sessions revoked");
            mutateSessions();
        } catch (err: any) {
            toast.error(err?.message || "Failed to revoke sessions");
        } finally {
            setRevokingAll(false);
        }
    };

    const deleteRevokedSession = async (jti: string) => {
        if (!userId) return;
        setDeletingSession(jti);
        try {
            const res = await csrfFetch(`/api/v1/admin/users/${userId}/sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jti })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || "Failed to delete session");
            }
            toast.success("Session deleted");
            mutateSessions(
                (current) => ({
                    userId: current?.userId ?? Number(userId),
                    sessions: (current?.sessions ?? []).filter((session) => session.jti !== jti)
                }),
                false
            );
        } catch (err: any) {
            toast.error(err?.message || "Failed to delete session");
        } finally {
            setDeletingSession(null);
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
                        {user.id === 1 ? "Owner" : user.isAdmin ? "Administrator" : "User"}
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

                    <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div>
                                <div className="text-sm font-semibold text-white">User Sessions</div>
                                <div className="text-xs text-gray-400">
                                    Active and recent sessions for this user.
                                </div>
                            </div>
                            <button
                                onClick={revokeAllSessions}
                                disabled={revokingAll}
                                className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            >
                                {revokingAll ? "Revoking..." : "Revoke all sessions"}
                            </button>
                        </div>

                        {!sessionsData?.sessions?.length ? (
                            <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-xs text-gray-400">
                                No sessions recorded.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                                        <tr className="border-b border-white/10">
                                            <th className="py-2">Device</th>
                                            <th className="py-2">Last Seen</th>
                                            <th className="py-2">Expires</th>
                                            <th className="py-2">IP</th>
                                            <th className="py-2">Status</th>
                                            <th className="py-2">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {sessionsData.sessions.map(session => (
                                            <tr key={session.jti}>
                                                <td className="py-2 text-gray-300">
                                                    {session.deviceLabel || "Unknown device"}
                                                </td>
                                                <td className="py-2 text-gray-300">{formatWhen(session.lastSeenAt)}</td>
                                                <td className="py-2 text-gray-300">
                                                    {session.revokedAt ? formatWhen(session.revokedAt) : formatWhen(session.expiresAt)}
                                                </td>
                                                <td className="py-2 text-gray-300">{session.ipAddress ?? "—"}</td>
                                                <td className="py-2">
                                                    {session.revokedAt ? (
                                                        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-200">
                                                            revoked
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                                                            active
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2">
                                                    {!session.revokedAt && (
                                                        <button
                                                            onClick={() => revokeSession(session.jti)}
                                                            disabled={revokingSession === session.jti}
                                                            className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                                                        >
                                                            {revokingSession === session.jti ? "Revoking..." : "Revoke"}
                                                        </button>
                                                    )}
                                                    {session.revokedAt && (
                                                        <button
                                                            onClick={() => deleteRevokedSession(session.jti)}
                                                            disabled={deletingSession === session.jti}
                                                            className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                                                        >
                                                            {deletingSession === session.jti ? "Deleting..." : "Delete"}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
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
