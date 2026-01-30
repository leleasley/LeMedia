"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { getAvatarAlt, getAvatarSrc } from "@/lib/avatar";

export type NotificationUser = {
    id: number;
    displayName: string;
    email?: string | null;
    discordUserId?: string | null;
    avatarUrl?: string | null;
    jellyfinUserId?: string | null;
};

interface NotificationUserSelectorProps {
    onUserSelected?: (user: NotificationUser | null) => void;
    label?: string;
    helperText?: string;
    initialSelectedUserId?: number | null;
    selectedDiscordUserId?: string | null;
    storageKey?: string;
}

export function NotificationUserSelector({
    onUserSelected,
    label = "Which user would you like to add this to?",
    helperText = "Optional: pick a user to pre-fill IDs (e.g. Discord mentions).",
    initialSelectedUserId = null,
    selectedDiscordUserId = null,
    storageKey = "lemedia.notifications.selectedUserId"
}: NotificationUserSelectorProps) {
    const { data, error, isLoading } = useSWR<{ results: NotificationUser[] }>(
        "/api/v1/admin/users?limit=200&sort=displayname"
    );
    const users = useMemo(() => data?.results ?? [], [data?.results]);
    const normalizedDiscordUserId = useMemo(() => {
        if (!selectedDiscordUserId) return null;
        const trimmed = selectedDiscordUserId.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/\d{5,}/);
        return match?.[0] ?? trimmed;
    }, [selectedDiscordUserId]);
    const allowStoredSelection = !normalizedDiscordUserId;
    const [userSelectedId, setUserSelectedId] = useState<number | null>(() => {
        if (typeof window === "undefined") return null;
        if (!allowStoredSelection) return null;
        try {
            const stored = window.localStorage.getItem(storageKey);
            if (!stored) return null;
            const parsed = Number(stored);
            return Number.isFinite(parsed) ? parsed : null;
        } catch {
            return null;
        }
    });

    const desiredId = useMemo(() => {
        if (!users.length) return null;
        if (normalizedDiscordUserId) {
            const match = users.find((user) => user.discordUserId === normalizedDiscordUserId);
            return match?.id ?? null;
        }
        if (initialSelectedUserId != null) {
            const match = users.find((user) => user.id === initialSelectedUserId);
            return match?.id ?? null;
        }
        return null;
    }, [users, normalizedDiscordUserId, initialSelectedUserId]);

    const selectedId = desiredId ?? userSelectedId;
    const selectedUser = useMemo(() => {
        if (selectedId == null) return null;
        return users.find((user) => user.id === selectedId) ?? null;
    }, [selectedId, users]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!allowStoredSelection) return;
        try {
            if (userSelectedId == null) {
                window.localStorage.removeItem(storageKey);
                return;
            }
            window.localStorage.setItem(storageKey, String(userSelectedId));
        } catch {
            return;
        }
    }, [userSelectedId, storageKey, allowStoredSelection]);

    const handleSelect = (userId: number | null) => {
        if (userId == null) {
            setUserSelectedId(null);
            onUserSelected?.(null);
            return;
        }
        const user = users.find((item) => item.id === userId) ?? null;
        setUserSelectedId(userId);
        onUserSelected?.(user);
    };

    return (
        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
            <label className="block text-sm font-medium text-white mb-2">{label}</label>
            <Listbox value={selectedId} onChange={handleSelect}>
                {({ open }) => (
                    <>
                        <div className="relative">
                            <Listbox.Button
                                type="button"
                                className="relative w-full cursor-default rounded border border-gray-700 bg-gray-900/70 px-3 py-2 text-left text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                                {selectedUser ? (
                                    <span className="flex items-center gap-3">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={getAvatarSrc(selectedUser)}
                                            alt={getAvatarAlt(selectedUser)}
                                            className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
                                            loading="eager"
                                            decoding="async"
                                        />
                                        <span className="truncate">
                                            {selectedUser.displayName}
                                            {selectedUser.email ? ` • ${selectedUser.email}` : ""}
                                        </span>
                                    </span>
                                ) : (
                                    <span className="text-gray-400">No user selected (optional)</span>
                                )}
                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-300">
                                    <ChevronDownIcon className="h-5 w-5" />
                                </span>
                            </Listbox.Button>
                            <Transition
                                as={Fragment}
                                show={open}
                                enter="transition ease-out duration-200"
                                enterFrom="opacity-0"
                                enterTo="opacity-100"
                                leave="transition ease-in duration-150"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0"
                            >
                                <Listbox.Options className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-white/10 bg-slate-900/90 py-1 text-sm">
                                <Listbox.Option key="none" value={null}>
                                    {({ active, selected }) => (
                                        <div
                                            className={`flex items-center gap-3 px-3 py-2 ${active ? "bg-white/10" : ""}`}
                                            >
                                                <span className={`text-sm ${selected ? "font-semibold" : ""}`}>
                                                    No user selected
                                                </span>
                                                {selected ? (
                                                    <CheckIcon className="ml-auto h-5 w-5 text-indigo-400" />
                                                ) : null}
                                            </div>
                                        )}
                                    </Listbox.Option>
                                    {users.map((user) => (
                                        <Listbox.Option key={user.id} value={user.id}>
                                            {({ active, selected }) => (
                                                <div
                                                    className={`flex items-center gap-3 px-3 py-2 ${active ? "bg-white/10" : ""}`}
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={getAvatarSrc(user)}
                                                        alt={getAvatarAlt(user)}
                                                        className="h-6 w-6 rounded-full object-cover"
                                                        loading="eager"
                                                        decoding="async"
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className={`text-sm ${selected ? "font-semibold" : ""}`}>
                                                            {user.displayName}
                                                        </span>
                                                        {user.email ? (
                                                            <span className="text-xs text-gray-400">{user.email}</span>
                                                        ) : null}
                                                    </div>
                                                    {selected ? (
                                                        <CheckIcon className="ml-auto h-5 w-5 text-indigo-400" />
                                                    ) : null}
                                                </div>
                                            )}
                                        </Listbox.Option>
                                    ))}
                                </Listbox.Options>
                            </Transition>
                        </div>
                    </>
                )}
            </Listbox>
            {helperText ? (
                <p className="mt-2 text-xs text-gray-400">{helperText}</p>
            ) : null}
            {isLoading ? (
                <p className="mt-2 text-xs text-gray-500">Loading users...</p>
            ) : null}
            {error ? (
                <p className="mt-2 text-xs text-red-400">{error?.message ?? "Unable to load users"}</p>
            ) : null}
            {selectedUser?.discordUserId ? (
                <p className="mt-2 text-xs text-emerald-300">
                    Discord ID detected: {selectedUser.discordUserId}
                </p>
            ) : null}
        </div>
    );
}
