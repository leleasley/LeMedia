"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { csrfFetch } from "@/lib/csrf-client";

interface NotificationEndpoint {
    id: number;
    name: string;
    type: string;
    enabled: boolean;
    is_global: boolean;
    types: number;
    config: Record<string, any>;
}

interface NotificationListProps {
    type: string;
    typeName: string;
}

const fetcher = async (url: string) => {
    const res = await fetch(url);
    const data = await res.json().catch(() => []);

    if (Array.isArray(data)) return data;
    if (data && Array.isArray((data as any).data)) return (data as any).data;

    return [];
};

export default function NotificationList({
    type,
    typeName,
}: NotificationListProps) {
    const [deleting, setDeleting] = useState<number | null>(null);
    const router = useRouter();

    const { data: endpoints, mutate, isLoading } = useSWR<NotificationEndpoint[]>(
        `/api/v1/admin/notifications/${type}/list`,
        fetcher
    );

    async function handleDelete(id: number) {
        if (!confirm("Are you sure you want to delete this notification endpoint?")) {
            return;
        }

        setDeleting(id);
        try {
            const response = await csrfFetch(`/api/v1/admin/notifications/${type}/${id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                mutate();
            } else {
                alert("Failed to delete notification endpoint");
            }
        } catch (error) {
            console.error("Error deleting endpoint:", error);
            alert("Failed to delete notification endpoint");
        } finally {
            setDeleting(null);
        }
    }

    async function handleToggle(id: number, currentEnabled: boolean) {
        const endpoint = endpoints?.find((e) => e.id === id);
        if (!endpoint) return;

        try {
            const response = await csrfFetch(`/api/v1/admin/notifications/${type}/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: endpoint.name,
                    enabled: !currentEnabled,
                    types: endpoint.types,
                    config: endpoint.config,
                }),
            });

            if (response.ok) {
                mutate();
            }
        } catch (error) {
            console.error("Error toggling endpoint:", error);
            mutate();
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
            </div>
        );
    }

    const hasEndpoints = Array.isArray(endpoints) && endpoints.length > 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-white">{typeName} Notifications</h2>
                <button
                    onClick={() => router.push(`/admin/settings/notifications/${type}/new`)}
                    className="btn btn-primary"
                >
                    Add New {typeName}
                </button>
            </div>

            {!hasEndpoints ? (
                <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-12 text-center">
                    <p className="text-gray-400">
                        No {typeName.toLowerCase()} notification endpoints configured yet.
                    </p>
                    <button
                        onClick={() => router.push(`/admin/settings/notifications/${type}/new`)}
                        className="mt-4 btn btn-primary"
                    >
                        Create Your First {typeName} Endpoint
                    </button>
                </div>
            ) : (
                <>
                    {/* Mobile card view */}
                    <div className="md:hidden space-y-4">
                        {endpoints!.map((endpoint) => (
                            <div key={endpoint.id} className="glass-strong rounded-2xl overflow-hidden border border-white/10 shadow-xl p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-white">{endpoint.name}</div>
                                        <div className="mt-2">
                                            {endpoint.is_global ? (
                                                <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-medium text-purple-400 border border-purple-500/20">
                                                    Global
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-400 border border-blue-500/20">
                                                    Custom
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleToggle(endpoint.id, endpoint.enabled)}
                                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium border ${endpoint.enabled
                                                ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                                                : "bg-gray-500/10 text-gray-400 border-gray-500/20 hover:bg-gray-500/20"
                                            }`}
                                    >
                                        {endpoint.enabled ? "Enabled" : "Disabled"}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                    <button
                                        onClick={() => router.push(`/admin/settings/notifications/${type}/${endpoint.id}`)}
                                        className="btn btn-primary text-xs"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(endpoint.id)}
                                        disabled={deleting === endpoint.id || endpoint.is_global}
                                        className={`btn text-xs ${endpoint.is_global
                                                ? "cursor-not-allowed opacity-50"
                                                : "btn-error"
                                            }`}
                                        title={
                                            endpoint.is_global
                                                ? "Global endpoints cannot be deleted"
                                                : "Delete endpoint"
                                        }
                                    >
                                        {deleting === endpoint.id ? "Deleting..." : "Delete"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop table view */}
                    <div className="hidden md:block">
                        <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                            <table className="min-w-full">
                                <thead className="border-b border-white/10">
                                    <tr className="bg-white/5">
                                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/60">
                                            Name
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/60">
                                            Type
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/60">
                                            Status
                                        </th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-white/60">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {endpoints!.map((endpoint) => (
                                        <tr key={endpoint.id} className="hover:bg-white/5 transition-colors">
                                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-white">
                                                {endpoint.name}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                                                {endpoint.is_global ? (
                                                    <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-400 border border-purple-500/20">
                                                        Global
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20">
                                                        Custom
                                                    </span>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm">
                                                <button
                                                    onClick={() => handleToggle(endpoint.id, endpoint.enabled)}
                                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${endpoint.enabled
                                                            ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                                                            : "bg-gray-500/10 text-gray-400 border-gray-500/20 hover:bg-gray-500/20"
                                                        }`}
                                                >
                                                    {endpoint.enabled ? "Enabled" : "Disabled"}
                                                </button>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                                                <button
                                                    onClick={() =>
                                                        router.push(`/admin/settings/notifications/${type}/${endpoint.id}`)
                                                    }
                                                    className="text-indigo-400 hover:text-indigo-300 mr-4 transition-colors"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(endpoint.id)}
                                                    disabled={deleting === endpoint.id || endpoint.is_global}
                                                    className={`${endpoint.is_global
                                                            ? "text-gray-600 cursor-not-allowed"
                                                            : "text-red-400 hover:text-red-300 transition-colors"
                                                        }`}
                                                    title={
                                                        endpoint.is_global
                                                            ? "Global endpoints cannot be deleted"
                                                            : "Delete endpoint"
                                                    }
                                                >
                                                    {deleting === endpoint.id ? "Deleting..." : "Delete"}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
