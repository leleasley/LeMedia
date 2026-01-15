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
            // Optimistic update (optional but good for UX)
            // mutate(endpoints?.map(e => e.id === id ? { ...e, enabled: !currentEnabled } : e), false);

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
            mutate(); // Revert on error
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
                <h2 className="text-2xl font-bold text-white">{typeName} Notifications</h2>
                <button
                    onClick={() => router.push(`/admin/settings/notifications/${type}/new`)}
                    className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 sm:w-auto shadow-lg shadow-indigo-600/20"
                >
                    Add New {typeName}
                </button>
            </div>

            {!hasEndpoints ? (
                <div className="rounded-lg border border-white/10 bg-slate-900/60 p-12 text-center">
                    <p className="text-gray-400">
                        No {typeName.toLowerCase()} notification endpoints configured yet.
                    </p>
                    <button
                        onClick={() => router.push(`/admin/settings/notifications/${type}/new`)}
                        className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20"
                    >
                        Create Your First {typeName} Endpoint
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="space-y-4 md:hidden">
                        {endpoints!.map((endpoint) => (
                            <div key={endpoint.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-4 shadow-sm">
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
                                <div className="mt-3 flex items-center gap-3">
                                    <button
                                        onClick={() => router.push(`/admin/settings/notifications/${type}/${endpoint.id}`)}
                                        className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(endpoint.id)}
                                        disabled={deleting === endpoint.id || endpoint.is_global}
                                        className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${endpoint.is_global
                                                ? "cursor-not-allowed border-gray-700 text-gray-500 bg-gray-800/50"
                                                : "border-red-500/40 text-red-300 hover:text-red-200 hover:bg-red-500/10"
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

                    <div className="hidden md:block">
                        <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/10">
                            <table className="min-w-full divide-y divide-white/5">
                                <thead className="bg-white/5">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                                            Name
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                                            Type
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">
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
                </div>
            )}
        </div>
    );
}
