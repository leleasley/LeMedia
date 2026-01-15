"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Cog6ToothIcon, UserIcon } from "@heroicons/react/24/solid";
import { DEFAULT_AVATAR_SRC, getAvatarAlt, getAvatarSrc, shouldBypassNextImage } from "@/lib/avatar";

interface ProfileHeaderProps {
  user: {
    username: string;
    email?: string | null;
    avatarUrl?: string | null;
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
  const avatarAlt = getAvatarAlt(user, user.username);

  return (
    <div className="relative z-0 mt-6 mb-12 lg:flex lg:items-end lg:justify-between lg:space-x-5">
      <div className="flex items-end justify-items-end space-x-5">
        <div className="flex-shrink-0">
          <div className="relative">
            <Image
              className="h-24 w-24 rounded-full bg-gray-600 object-cover ring-1 ring-gray-700"
              src={avatarSrc}
              alt={avatarAlt}
              width={96}
              height={96}
              unoptimized={shouldBypassNextImage(avatarSrc)}
              onError={() => setAvatarError(true)}
            />
            <span
              className="absolute inset-0 rounded-full shadow-inner"
              aria-hidden="true"
            />
          </div>
        </div>
        <div className="pt-1.5">
          <h1 className="mb-1 flex flex-col sm:flex-row sm:items-center">
            <span className="text-lg font-bold text-purple-300 hover:text-purple-200 sm:text-2xl">
              {user.username}
            </span>
            {user.email && user.username.toLowerCase() !== user.email && (
              <span className="text-sm text-gray-400 sm:ml-2 sm:text-lg">
                ({user.email})
              </span>
            )}
          </h1>
          <p className="text-sm font-medium text-gray-400">
            {joinDate && `Joined ${joinDate}`}
            {isAdmin && user.userId && ` | User ID: ${user.userId}`}
          </p>
        </div>
      </div>
      <div className="justify-stretch mt-6 flex flex-col-reverse space-y-4 space-y-reverse lg:flex-row lg:justify-end lg:space-y-0 lg:space-x-3 lg:space-x-reverse">
        {!isSettingsPage ? (
          <Link
            href="/settings/profile"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white ring-1 ring-gray-700 hover:bg-gray-700 transition-colors"
          >
            <Cog6ToothIcon className="h-5 w-5" />
            <span>Edit Settings</span>
          </Link>
        ) : (
          <Link
            href="/profile"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white ring-1 ring-gray-700 hover:bg-gray-700 transition-colors"
          >
            <UserIcon className="h-5 w-5" />
            <span>View Profile</span>
          </Link>
        )}
      </div>
    </div>
  );
}
