"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { csrfFetch } from "@/lib/csrf-client";

type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  createdAt: string;
  isRead: boolean;
  metadata?: {
    mediaId?: number;
    mediaType?: string;
    title?: string;
  };
};

type NotificationsResponse = {
  notifications: Notification[];
  unreadCount: number;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data, mutate } = useSWR<NotificationsResponse>("/api/notifications/unread", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [isOpen]);

  const markAsRead = async (notificationId: number) => {
    try {
      await csrfFetch(`/api/notifications/${notificationId}/read`, {
        method: "POST"
      });
      mutate();
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await csrfFetch("/api/notifications/read-all", {
        method: "POST"
      });
      mutate();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-white/5 transition"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[32rem] overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-2xl z-50">
          <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-900">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[28rem]">
            {notifications.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="h-12 w-12 mx-auto text-white/20 mb-3" />
                <p className="text-sm text-white/60">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const content = (
                  <div
                    className={`px-4 py-3 border-b border-white/5 hover:bg-white/10 transition-colors cursor-pointer ${
                      !notif.isRead ? "bg-indigo-500/5 border-l-2 border-l-indigo-500" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {notif.title && (
                          <p className="text-sm font-semibold text-white mb-1">
                            {notif.title}
                          </p>
                        )}
                        <p className="text-sm text-white/80">
                          {notif.message}
                        </p>
                        <p className="text-xs text-white/50 mt-1.5">
                          {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {!notif.isRead && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markAsRead(notif.id);
                          }}
                          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-indigo-500/20 transition-colors"
                          aria-label="Mark as read"
                          title="Mark as read"
                        >
                          <Check className="h-4 w-4 text-indigo-400" />
                        </button>
                      )}
                    </div>
                  </div>
                );

                if (notif.link) {
                  return (
                    <PrefetchLink key={notif.id} href={notif.link} onClick={() => setIsOpen(false)}>
                      {content}
                    </PrefetchLink>
                  );
                }

                return <div key={notif.id}>{content}</div>;
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
