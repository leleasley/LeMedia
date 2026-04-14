"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Cog6ToothIcon, UserIcon } from "@heroicons/react/24/solid";
import { DEFAULT_AVATAR_SRC, getAvatarAlt, getAvatarSrc, shouldBypassNextImage } from "@/lib/avatar";

interface ProfileHeaderProps {
  user: {
    username: string;
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    avatarVersion?: number | null;
    jellyfinUserId?: string | null;
    createdAt?: string | Date;
    userId?: number;
  };
  isSettingsPage?: boolean;
  isAdmin?: boolean;
}

export function ProfileHeader({ user, isSettingsPage = false, isAdmin = false }: ProfileHeaderProps) {
  const [avatarError, setAvatarError] = useState(false);
  
  const joinDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const baseAvatarSrc = getAvatarSrc(user);
  const avatarSrc = avatarError ? DEFAULT_AVATAR_SRC : baseAvatarSrc;
  const displayName = user.displayName?.trim() ? user.displayName : user.username;
  const avatarAlt = getAvatarAlt({ ...user, displayName }, displayName);

  return (
    <div className="relative z-10 mb-8 flex flex-col gap-5 lg:mb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
      <div className="flex items-end gap-4 sm:gap-5">
        <div className="flex-shrink-0">
          <div className="relative">
            <Image
              className="h-24 w-24 rounded-full bg-gray-600 object-cover ring-2 ring-white/20 shadow-[0_18px_50px_rgba(0,0,0,0.45)] sm:h-28 sm:w-28 lg:h-32 lg:w-32"
              src={avatarSrc}
              alt={avatarAlt}
              width={128}
              height={128}
              unoptimized={shouldBypassNextImage(avatarSrc)}
              onError={() => setAvatarError(true)}
            />
            <span
              className="absolute inset-0 rounded-full shadow-inner"
              aria-hidden="true"
            />
          </div>
        </div>
        <div className="min-w-0 pb-1">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55 backdrop-blur-md">
            <span>Profile</span>
            {isAdmin ? <span className="text-purple-300">Admin</span> : null}
          </div>
          <h1 className="mb-1 flex flex-col sm:flex-row sm:flex-wrap sm:items-end">
            <span className="truncate text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              {displayName}
            </span>
            {user.username && displayName !== user.username && (
              <span className="truncate text-sm text-white/55 sm:ml-3 sm:text-lg lg:text-xl">
                @{user.username}
              </span>
            )}
            {user.email && user.username.toLowerCase() !== user.email && displayName === user.username && (
              <span className="truncate text-sm text-white/55 sm:ml-3 sm:text-lg lg:text-xl">
                ({user.email})
              </span>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/60 sm:text-sm">
            {joinDate ? (
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 backdrop-blur-sm">
                Joined {joinDate}
              </span>
            ) : null}
            {isAdmin && user.userId ? (
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 backdrop-blur-sm">
                User ID: {user.userId}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-start lg:justify-end">
        {!isSettingsPage ? (
          <Link
            href="/settings/profile"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-black/35 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-black/50 sm:w-auto"
          >
            <Cog6ToothIcon className="h-5 w-5" />
            <span>Edit Settings</span>
          </Link>
        ) : (
          <Link
            href="/profile"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-black/35 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-black/50 sm:w-auto"
          >
            <UserIcon className="h-5 w-5" />
            <span>View Profile</span>
          </Link>
        )}
      </div>
    </div>
  );
}
