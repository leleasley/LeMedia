"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";
import { useToast } from "@/components/Providers/ToastProvider";

interface User {
    id: number;
    email: string;
    displayName: string;
    isAdmin: boolean;
    createdAt: string;
}

interface UserPermissionsClientProps {
    userId?: string | number;
    editable?: boolean;
    variant?: "boxed" | "plain";
}

export function UserPermissionsClient({ userId: userIdProp, editable, variant }: UserPermissionsClientProps = {}) {
    const params = useParams();
    const routeUserId = params?.id;
    const resolvedUserId = userIdProp ?? routeUserId;
    const safeUserId = resolvedUserId ? String(resolvedUserId) : null;
    const canEdit = editable ?? true;
    const toast = useToast();

    const { data: user, error: userError } = useSWR<User>(safeUserId ? `/api/v1/admin/users/${safeUserId}` : null);
    const { data: permissions, error: permissionsError } = useSWR(safeUserId ? `/api/v1/admin/users/${safeUserId}/permissions` : null);

    // Permissions State
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

    // Load permissions when data is available
    useEffect(() => {
        if (permissions) {
            setPermAdmin(permissions.permAdmin || false);
            setPermManageUsers(permissions.permManageUsers || false);
            setPermManageRequests(permissions.permManageRequests || false);
            setPermAdvancedRequests(permissions.permAdvancedRequests || false);
            setPermViewRequests(permissions.permViewRequests || false);
            setPermViewRecent(permissions.permViewRecent || false);
            setPermRequest(permissions.permRequest !== false);
            setPermRequestMovies(permissions.permRequestMovies !== false);
            setPermRequestTv(permissions.permRequestTv !== false);
            setPermAutoapprove(permissions.permAutoapprove || false);
            setPermAutoapproveMovies(permissions.permAutoapproveMovies || false);
            setPermAutoapproveTv(permissions.permAutoapproveTv || false);
            setPermRequest4k(permissions.permRequest4k || false);
            setPermRequest4kMovies(permissions.permRequest4kMovies || false);
            setPermRequest4kTv(permissions.permRequest4kTv || false);
            setPermAutoapprove4k(permissions.permAutoapprove4k || false);
            setPermAutoapprove4kMovies(permissions.permAutoapprove4kMovies || false);
            setPermAutoapprove4kTv(permissions.permAutoapprove4kTv || false);
            setPermManageIssues(permissions.permManageIssues || false);
            setPermReportIssues(permissions.permReportIssues !== false);
            setPermViewIssues(permissions.permViewIssues !== false);
        }
    }, [permissions]);

    const handleSave = async () => {
        if (!canEdit || !safeUserId) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/v1/admin/users/${safeUserId}/permissions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    permissions: {
                        permAdmin, permManageUsers, permManageRequests, permAdvancedRequests,
                        permViewRequests, permViewRecent, permRequest, permRequestMovies, permRequestTv,
                        permAutoapprove, permAutoapproveMovies, permAutoapproveTv,
                        permRequest4k, permRequest4kMovies, permRequest4kTv,
                        permAutoapprove4k, permAutoapprove4kMovies, permAutoapprove4kTv,
                        permManageIssues, permReportIssues, permViewIssues
                    }
                }),
            });
            if (res.ok) {
                toast.success("Permissions saved successfully!");
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to save permissions");
            }
        } catch (error) {
            console.error("Error saving permissions:", error);
            toast.error("Failed to save permissions");
        } finally {
            setSaving(false);
        }
    };

    if (userError || permissionsError) {
        return (
            <div className="p-8 text-center text-red-500">
                Failed to load permissions
            </div>
        );
    }

    if (!user || !permissions) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
            </div>
        );
    }

    const panelClasses = variant === "plain"
        ? "space-y-6"
        : "rounded-lg border border-white/10 bg-slate-900/60 p-6 space-y-6";

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-white mb-1">Permissions</h3>
                <p className="text-sm text-gray-400">Configure what this user can access and do</p>
            </div>

            <div className={panelClasses}>
                {/* Admin */}
                <div>
                    <AnimatedCheckbox
                        id="perm-admin"
                        label="Admin"
                        description="Full administrator access. Bypasses all other permission checks."
                        checked={permAdmin}
                        onChange={(e) => setPermAdmin(e.target.checked)}
                        disabled={!canEdit}
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
                        disabled={!canEdit}
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
                        disabled={!canEdit}
                    />
                    <div className="ml-8 space-y-1 border-l-2 border-gray-700 pl-4">
                        <AnimatedCheckbox
                            id="perm-advanced-requests"
                            label="Advanced Requests"
                            description="Grant permission to modify advanced media request options."
                            checked={permAdvancedRequests}
                            onChange={(e) => setPermAdvancedRequests(e.target.checked)}
                            disabled={!canEdit}
                        />
                        <AnimatedCheckbox
                            id="perm-view-requests"
                            label="View Requests"
                            description="Grant permission to view media requests submitted by other users."
                            checked={permViewRequests}
                            onChange={(e) => setPermViewRequests(e.target.checked)}
                            disabled={!canEdit}
                        />
                        <AnimatedCheckbox
                            id="perm-view-recent"
                            label="View Recently Added"
                            description="Grant permission to view the list of recently added media."
                            checked={permViewRecent}
                            onChange={(e) => setPermViewRecent(e.target.checked)}
                            disabled={!canEdit}
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
                        disabled={!canEdit}
                    />
                    <div className="ml-8 space-y-1 border-l-2 border-gray-700 pl-4">
                        <AnimatedCheckbox
                            id="perm-request-movies"
                            label="Request Movies"
                            description="Grant permission to submit requests for non-4K movies."
                            checked={permRequestMovies}
                            onChange={(e) => setPermRequestMovies(e.target.checked)}
                            disabled={!canEdit}
                        />
                        <AnimatedCheckbox
                            id="perm-request-tv"
                            label="Request Series"
                            description="Grant permission to submit requests for non-4K series."
                            checked={permRequestTv}
                            onChange={(e) => setPermRequestTv(e.target.checked)}
                            disabled={!canEdit}
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
                        disabled={!canEdit}
                    />
                    <div className="ml-8 space-y-1 border-l-2 border-gray-700 pl-4">
                        <AnimatedCheckbox
                            id="perm-autoapprove-movies"
                            label="Auto-Approve Movies"
                            description="Grant automatic approval for non-4K movie requests."
                            checked={permAutoapproveMovies}
                            onChange={(e) => setPermAutoapproveMovies(e.target.checked)}
                            disabled={!canEdit}
                        />
                        <AnimatedCheckbox
                            id="perm-autoapprove-tv"
                            label="Auto-Approve Series"
                            description="Grant automatic approval for non-4K series requests."
                            checked={permAutoapproveTv}
                            onChange={(e) => setPermAutoapproveTv(e.target.checked)}
                            disabled={!canEdit}
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
                        disabled={!canEdit}
                    />
                    <div className="ml-8 space-y-1 border-l-2 border-gray-700 pl-4">
                        <AnimatedCheckbox
                            id="perm-request-4k-movies"
                            label="Request 4K Movies"
                            description="Grant permission to submit requests for 4K movies."
                            checked={permRequest4kMovies}
                            onChange={(e) => setPermRequest4kMovies(e.target.checked)}
                            disabled={!canEdit}
                        />
                        <AnimatedCheckbox
                            id="perm-request-4k-tv"
                            label="Request 4K Series"
                            description="Grant permission to submit requests for 4K series."
                            checked={permRequest4kTv}
                            onChange={(e) => setPermRequest4kTv(e.target.checked)}
                            disabled={!canEdit}
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
                        disabled={!canEdit}
                    />
                    <div className="ml-8 space-y-1 border-l-2 border-gray-700 pl-4">
                        <AnimatedCheckbox
                            id="perm-autoapprove-4k-movies"
                            label="Auto-Approve 4K Movies"
                            description="Grant automatic approval for 4K movie requests."
                            checked={permAutoapprove4kMovies}
                            onChange={(e) => setPermAutoapprove4kMovies(e.target.checked)}
                            disabled={!canEdit}
                        />
                        <AnimatedCheckbox
                            id="perm-autoapprove-4k-tv"
                            label="Auto-Approve 4K Series"
                            description="Grant automatic approval for 4K series requests."
                            checked={permAutoapprove4kTv}
                            onChange={(e) => setPermAutoapprove4kTv(e.target.checked)}
                            disabled={!canEdit}
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
                        disabled={!canEdit}
                    />
                    <div className="ml-8 space-y-1 border-l-2 border-gray-700 pl-4">
                        <AnimatedCheckbox
                            id="perm-report-issues"
                            label="Report Issues"
                            description="Grant permission to report media issues."
                            checked={permReportIssues}
                            onChange={(e) => setPermReportIssues(e.target.checked)}
                            disabled={!canEdit}
                        />
                        <AnimatedCheckbox
                            id="perm-view-issues"
                            label="View Issues"
                            description="Grant permission to view media issues reported by other users."
                            checked={permViewIssues}
                            onChange={(e) => setPermViewIssues(e.target.checked)}
                            disabled={!canEdit}
                        />
                    </div>
                </div>

                {canEdit && (
                    <div className="border-t border-white/10 pt-6 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={!canEdit || saving}
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? "Saving..." : "Save Permissions"}
                        </button>
                    </div>
                )}
            </div>

            {!canEdit && (
                <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
                    Permission changes can only be managed by administrators.
                </div>
            )}
        </div>
    );
}
