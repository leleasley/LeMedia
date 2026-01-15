"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import Image from "next/image";
import { useToast } from "@/components/Providers/ToastProvider";

interface User {
    id: number;
    email: string;
    displayName: string;
    isAdmin: boolean;
    createdAt: string;
    jellyfinUserId: string | null;
    jellyfinUsername: string | null;
}

export function UserLinkedAccountsClient() {
    const params = useParams();
    const userId = params?.id;
    const toast = useToast();
    const [unlinking, setUnlinking] = useState(false);

    const { data: user, error, mutate } = useSWR<User>(userId ? `/api/v1/admin/users/${userId}` : null);

    const handleUnlink = async () => {
        if (!confirm("Are you sure you want to unlink this Jellyfin account?")) {
            return;
        }

        setUnlinking(true);
        try {
            const res = await fetch(`/api/v1/admin/users/${userId}/unlink-jellyfin`, {
                method: "POST",
            });
            if (res.ok) {
                toast.success("Jellyfin account unlinked successfully");
                mutate();
            } else {
                toast.error("Failed to unlink account");
            }
        } catch (error) {
            console.error("Error unlinking account:", error);
            toast.error("Failed to unlink account");
        } finally {
            setUnlinking(false);
        }
    };

    if (error) {
        return (
            <div className="p-8 text-center text-red-500">
                Failed to load linked accounts
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

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-white mb-1">Linked Accounts</h3>
                <p className="text-sm text-gray-400">View and manage connected external accounts</p>
            </div>

            <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6">
                {user.jellyfinUserId ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                            <Image
                                src="/images/jellyfin.svg"
                                alt="Jellyfin"
                                width={48}
                                height={48}
                                className="h-12 w-12"
                            />
                            <div className="flex-1">
                                <h4 className="text-lg font-semibold text-white">Jellyfin</h4>
                                <p className="text-sm text-gray-400">{user.jellyfinUsername || "Connected"}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-medium">
                                    Connected
                                </div>
                                <button
                                    onClick={handleUnlink}
                                    disabled={unlinking}
                                    className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {unlinking ? "Unlinking..." : "Unlink"}
                                </button>
                            </div>
                        </div>
                        <div className="text-sm text-gray-400">
                            <p>
                                <span className="font-medium text-white">Jellyfin User ID:</span> {user.jellyfinUserId}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <p className="text-gray-400">No linked accounts</p>
                        <p className="text-sm text-gray-500 mt-2">
                            This user has not connected any external accounts
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
