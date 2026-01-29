"use client";

import { useState, useEffect } from "react";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { RequestLimitSelector } from "@/components/Common/RequestLimitSelector";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";

export default function AdminSettingsUsersPage() {
    const toast = useToast();
    // Set page title
    useEffect(() => {
        document.title = "User Settings - Admin - LeMedia";
    }, []);

    // Login Methods State
    const [localLogin, setLocalLogin] = useState(true);
    const [jellyfinLogin, setJellyfinLogin] = useState(true);
    const [newJellyfinLogin, setNewJellyfinLogin] = useState(false);

    // Request Limits State
    const [movieRequestLimit, setMovieRequestLimit] = useState(0);
    const [movieRequestDays, setMovieRequestDays] = useState(7);
    const [seriesRequestLimit, setSeriesRequestLimit] = useState(0);
    const [seriesRequestDays, setSeriesRequestDays] = useState(7);

    // Default Permissions State
    const [permAdmin, setPermAdmin] = useState(false);
    const [permManageUsers, setPermManageUsers] = useState(false);
    const [permManageRequests, setPermManageRequests] = useState(false);
    const [permAdvancedRequests, setPermAdvancedRequests] = useState(false);
    const [permViewRequests, setPermViewRequests] = useState(false);
    const [permViewRecent, setPermViewRecent] = useState(false);
    const [permRequest, setPermRequest] = useState(true);
    const [permRequestMovies, setPermRequestMovies] = useState(true);
    const [permRequestTv, setPermRequestTv] = useState(true);
    const [permAutoapprove, setPermAutoapprove] = useState(false);
    const [permAutoapproveMovies, setPermAutoapproveMovies] = useState(false);
    const [permAutoapproveTv, setPermAutoapproveTv] = useState(false);
    const [permRequest4k, setPermRequest4k] = useState(false);
    const [permRequest4kMovies, setPermRequest4kMovies] = useState(false);
    const [permRequest4kTv, setPermRequest4kTv] = useState(false);
    const [permAutoapprove4k, setPermAutoapprove4k] = useState(false);
    const [permAutoapprove4kMovies, setPermAutoapprove4kMovies] = useState(false);
    const [permAutoapprove4kTv, setPermAutoapprove4kTv] = useState(false);
    const [permManageIssues, setPermManageIssues] = useState(false);
    const [permReportIssues, setPermReportIssues] = useState(true);
    const [permViewIssues, setPermViewIssues] = useState(true);

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let active = true;
        fetch("/api/v1/admin/settings/users", { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) throw new Error("Failed to load settings");
                return res.json();
            })
            .then((data) => {
                if (!active) return;
                setMovieRequestLimit(Number(data?.movie?.limit ?? 0));
                setMovieRequestDays(Number(data?.movie?.days ?? 7));
                setSeriesRequestLimit(Number(data?.series?.limit ?? 0));
                setSeriesRequestDays(Number(data?.series?.days ?? 7));
            })
            .catch((error) => {
                console.error("Failed to load user settings:", error);
                toast.error("Failed to load request limits.");
            });
        return () => {
            active = false;
        };
    }, [toast]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await csrfFetch("/api/v1/admin/settings/users", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    movie: {
                        limit: movieRequestLimit,
                        days: movieRequestDays
                    },
                    series: {
                        limit: seriesRequestLimit,
                        days: seriesRequestDays
                    }
                })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to save settings");
            }
            toast.success("Settings saved successfully!");
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="space-y-6">
            {/* Header Section */}
            <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent p-6 md:p-8">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                <div className="relative">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 ring-1 ring-white/10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-300">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-white">Users</h1>
                            <p className="text-sm text-white/60 mt-1">Configure global and default user settings</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-6">
                {/* Login Methods */}
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Authentication</p>
                    <h3 className="text-lg font-semibold text-white">Login Methods</h3>
                    <p className="text-sm text-muted mb-4">Configure login methods for users.</p>

                    <div className="space-y-1">
                        <AnimatedCheckbox
                            id="local-login"
                            label="Enable Local Sign-In"
                            description="Allow users to sign in using their email address and password"
                            checked={localLogin}
                            onChange={(e) => setLocalLogin(e.target.checked)}
                        />

                        <AnimatedCheckbox
                            id="jellyfin-login"
                            label="Enable Jellyfin Sign-In"
                            description="Allow users to sign in using their Jellyfin account"
                            checked={jellyfinLogin}
                            onChange={(e) => setJellyfinLogin(e.target.checked)}
                        />

                        <AnimatedCheckbox
                            id="new-jellyfin-login"
                            label="Enable New Jellyfin Sign-In"
                            description="Allow Jellyfin users to sign in without first being imported"
                            checked={newJellyfinLogin}
                            onChange={(e) => setNewJellyfinLogin(e.target.checked)}
                        />
                    </div>
                </div>

                {/* Request Limits */}
                <div className="border-t border-white/10 pt-6">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Limits</p>
                    <h3 className="text-lg font-semibold text-white">Global Request Limits</h3>
                    <p className="text-sm text-muted mb-4">Set default request limits for all users.</p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-white mb-2">Global Movie Request Limit</label>
                            <RequestLimitSelector
                                limit={movieRequestLimit}
                                days={movieRequestDays}
                                onChange={(limit, days) => {
                                    setMovieRequestLimit(limit);
                                    setMovieRequestDays(days);
                                }}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-white mb-2">Global Series Request Limit</label>
                            <RequestLimitSelector
                                limit={seriesRequestLimit}
                                days={seriesRequestDays}
                                onChange={(limit, days) => {
                                    setSeriesRequestLimit(limit);
                                    setSeriesRequestDays(days);
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Default Permissions */}
                <div className="border-t border-white/10 pt-6">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Permissions</p>
                    <h3 className="text-lg font-semibold text-white">Default Permissions</h3>
                    <p className="text-sm text-muted mb-4">Initial permissions assigned to new users</p>

                    <div className="space-y-6">
                        {/* Admin */}
                        <div>
                            <AnimatedCheckbox
                                id="perm-admin"
                                label="Admin"
                                description="Full administrator access. Bypasses all other permission checks."
                                checked={permAdmin}
                                onChange={(e) => setPermAdmin(e.target.checked)}
                            />
                        </div>

                        {/* Manage Users */}
                        <div>
                            <AnimatedCheckbox
                                id="perm-manage-users"
                                label="Manage Users"
                                description="Grant permission to manage users. Users with this permission cannot modify users with or grant the Admin privilege."
                                checked={permManageUsers}
                                onChange={(e) => setPermManageUsers(e.target.checked)}
                            />
                        </div>

                        {/* Manage Requests */}
                        <div className="space-y-1">
                            <AnimatedCheckbox
                                id="perm-manage-requests"
                                label="Manage Requests"
                                description="Grant permission to manage media requests. All requests made by a user with this permission will be automatically approved."
                                checked={permManageRequests}
                                onChange={(e) => setPermManageRequests(e.target.checked)}
                            />
                            <div className="ml-8 space-y-1 border-l-2 border-white/10 pl-4">
                                <AnimatedCheckbox
                                    id="perm-advanced-requests"
                                    label="Advanced Requests"
                                    description="Grant permission to modify advanced media request options."
                                    checked={permAdvancedRequests}
                                    onChange={(e) => setPermAdvancedRequests(e.target.checked)}
                                />
                                <AnimatedCheckbox
                                    id="perm-view-requests"
                                    label="View Requests"
                                    description="Grant permission to view media requests submitted by other users."
                                    checked={permViewRequests}
                                    onChange={(e) => setPermViewRequests(e.target.checked)}
                                />
                                <AnimatedCheckbox
                                    id="perm-view-recent"
                                    label="View Recently Added"
                                    description="Grant permission to view the list of recently added media."
                                    checked={permViewRecent}
                                    onChange={(e) => setPermViewRecent(e.target.checked)}
                                />
                            </div>
                        </div>

                        {/* Request */}
                        <div className="space-y-1">
                            <AnimatedCheckbox
                                id="perm-request"
                                label="Request"
                                description="Grant permission to submit requests for non-4K media."
                                checked={permRequest}
                                onChange={(e) => setPermRequest(e.target.checked)}
                            />
                            <div className="ml-8 space-y-1 border-l-2 border-white/10 pl-4">
                                <AnimatedCheckbox
                                    id="perm-request-movies"
                                    label="Request Movies"
                                    description="Grant permission to submit requests for non-4K movies."
                                    checked={permRequestMovies}
                                    onChange={(e) => setPermRequestMovies(e.target.checked)}
                                />
                                <AnimatedCheckbox
                                    id="perm-request-tv"
                                    label="Request Series"
                                    description="Grant permission to submit requests for non-4K series."
                                    checked={permRequestTv}
                                    onChange={(e) => setPermRequestTv(e.target.checked)}
                                />
                            </div>
                        </div>

                        {/* Auto-Approve */}
                        <div className="space-y-1">
                            <AnimatedCheckbox
                                id="perm-autoapprove"
                                label="Auto-Approve"
                                description="Grant automatic approval for all non-4K media requests."
                                checked={permAutoapprove}
                                onChange={(e) => setPermAutoapprove(e.target.checked)}
                            />
                            <div className="ml-8 space-y-1 border-l-2 border-white/10 pl-4">
                                <AnimatedCheckbox
                                    id="perm-autoapprove-movies"
                                    label="Auto-Approve Movies"
                                    description="Grant automatic approval for non-4K movie requests."
                                    checked={permAutoapproveMovies}
                                    onChange={(e) => setPermAutoapproveMovies(e.target.checked)}
                                />
                                <AnimatedCheckbox
                                    id="perm-autoapprove-tv"
                                    label="Auto-Approve Series"
                                    description="Grant automatic approval for non-4K series requests."
                                    checked={permAutoapproveTv}
                                    onChange={(e) => setPermAutoapproveTv(e.target.checked)}
                                />
                            </div>
                        </div>

                        {/* Request 4K */}
                        <div className="space-y-1">
                            <AnimatedCheckbox
                                id="perm-request-4k"
                                label="Request 4K"
                                description="Grant permission to submit requests for 4K media."
                                checked={permRequest4k}
                                onChange={(e) => setPermRequest4k(e.target.checked)}
                            />
                            <div className="ml-8 space-y-1 border-l-2 border-white/10 pl-4">
                                <AnimatedCheckbox
                                    id="perm-request-4k-movies"
                                    label="Request 4K Movies"
                                    description="Grant permission to submit requests for 4K movies."
                                    checked={permRequest4kMovies}
                                    onChange={(e) => setPermRequest4kMovies(e.target.checked)}
                                />
                                <AnimatedCheckbox
                                    id="perm-request-4k-tv"
                                    label="Request 4K Series"
                                    description="Grant permission to submit requests for 4K series."
                                    checked={permRequest4kTv}
                                    onChange={(e) => setPermRequest4kTv(e.target.checked)}
                                />
                            </div>
                        </div>

                        {/* Auto-Approve 4K */}
                        <div className="space-y-1">
                            <AnimatedCheckbox
                                id="perm-autoapprove-4k"
                                label="Auto-Approve 4K"
                                description="Grant automatic approval for all 4K media requests."
                                checked={permAutoapprove4k}
                                onChange={(e) => setPermAutoapprove4k(e.target.checked)}
                            />
                            <div className="ml-8 space-y-1 border-l-2 border-white/10 pl-4">
                                <AnimatedCheckbox
                                    id="perm-autoapprove-4k-movies"
                                    label="Auto-Approve 4K Movies"
                                    description="Grant automatic approval for 4K movie requests."
                                    checked={permAutoapprove4kMovies}
                                    onChange={(e) => setPermAutoapprove4kMovies(e.target.checked)}
                                />
                                <AnimatedCheckbox
                                    id="perm-autoapprove-4k-tv"
                                    label="Auto-Approve 4K Series"
                                    description="Grant automatic approval for 4K series requests."
                                    checked={permAutoapprove4kTv}
                                    onChange={(e) => setPermAutoapprove4kTv(e.target.checked)}
                                />
                            </div>
                        </div>

                        {/* Manage Issues */}
                        <div className="space-y-1">
                            <AnimatedCheckbox
                                id="perm-manage-issues"
                                label="Manage Issues"
                                description="Grant permission to manage media issues."
                                checked={permManageIssues}
                                onChange={(e) => setPermManageIssues(e.target.checked)}
                            />
                            <div className="ml-8 space-y-1 border-l-2 border-white/10 pl-4">
                                <AnimatedCheckbox
                                    id="perm-report-issues"
                                    label="Report Issues"
                                    description="Grant permission to report media issues."
                                    checked={permReportIssues}
                                    onChange={(e) => setPermReportIssues(e.target.checked)}
                                />
                                <AnimatedCheckbox
                                    id="perm-view-issues"
                                    label="View Issues"
                                    description="Grant permission to view media issues reported by other users."
                                    checked={permViewIssues}
                                    onChange={(e) => setPermViewIssues(e.target.checked)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <div className="border-t border-white/10 pt-6 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn btn-primary"
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>
        </section>
    );
}
