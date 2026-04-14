"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, ChevronRight, Clapperboard, MessageSquare, Sparkles, Tv, X } from "lucide-react";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { csrfFetch } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

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
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

function getNotificationPresentation(notification: Notification) {
  const type = String(notification.type ?? "").toLowerCase();

  if (type.includes("request") || type.includes("approval") || type.includes("available")) {
    return {
      icon: <Clapperboard className="h-4 w-4" />,
      accent: "bg-cyan-500/12 text-cyan-300 border-cyan-400/20",
      chip: "Media",
    };
  }

  if (type.includes("review") || type.includes("comment") || type.includes("reply")) {
    return {
      icon: <MessageSquare className="h-4 w-4" />,
      accent: "bg-amber-500/12 text-amber-300 border-amber-400/20",
      chip: "Social",
    };
  }

  if (type.includes("episode") || type.includes("calendar") || type.includes("reminder")) {
    return {
      icon: <Tv className="h-4 w-4" />,
      accent: "bg-violet-500/12 text-violet-300 border-violet-400/20",
      chip: "Reminder",
    };
  }

  return {
    icon: <Sparkles className="h-4 w-4" />,
    accent: "bg-white/10 text-white/75 border-white/10",
    chip: "Update",
  };
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data, mutate } = useSWR<NotificationsResponse>("/api/notifications/unread", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
    revalidateIfStale: true,
  });

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let stream: EventSource | null = null;

    const connect = () => {
      if (closed) return;

      stream = new EventSource("/api/notifications/stream");

      stream.addEventListener("notifications", (event) => {
        try {
          const snapshot = JSON.parse((event as MessageEvent).data) as NotificationsResponse;
          void mutate(snapshot, { revalidate: false });
        } catch (error) {
          logger.error("[Notifications] Failed to parse live notification payload", error);
        }
      });

      stream.onerror = () => {
        stream?.close();
        stream = null;
        if (closed || reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void mutate();
          connect();
        }, 5000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stream?.close();
    };
  }, [mutate]);

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
        method: "POST",
      });
      mutate();
    } catch (error) {
      logger.error("[Notifications] Failed to mark as read", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await csrfFetch("/api/notifications/read-all", {
        method: "POST",
      });
      mutate();
    } catch (error) {
      logger.error("[Notifications] Failed to mark all as read", error);
    }
  };

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-full p-2 transition hover:bg-white/5"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-white" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[26rem] md:sm:w-[28rem]">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm sm:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div className="absolute inset-x-0 bottom-0 max-h-[84vh] overflow-hidden rounded-t-[1.75rem] border border-sky-200/10 bg-[linear-gradient(180deg,rgba(6,14,28,0.98),rgba(6,12,24,0.99))] shadow-[0_20px_80px_rgba(0,0,0,0.6)] sm:relative sm:inset-auto sm:max-h-[36rem] sm:rounded-2xl sm:border-white/15">
            <div className="sticky top-0 z-10 border-b border-white/10 bg-[linear-gradient(180deg,rgba(7,16,32,0.98),rgba(7,14,28,0.94))] px-4 pb-3 pt-3 backdrop-blur-xl sm:pt-3">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15 sm:hidden" />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Notifications</h3>
                  <p className="mt-0.5 text-xs text-white/45">
                    {unreadCount > 0 ? `${unreadCount} unread updates` : "All caught up"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 ? (
                    <button
                      onClick={markAllAsRead}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      Mark all read
                    </button>
                  ) : null}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
                    aria-label="Close notifications"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto px-3 pb-3 pt-3 sm:max-h-[30rem]">
              {notifications.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-inner shadow-black/30">
                    <Bell className="h-6 w-6 text-white/30" />
                  </div>
                  <p className="text-sm font-medium text-white/80">No notifications yet</p>
                  <p className="mt-1 text-xs text-white/55">Approvals, comments, reminders, and feed-worthy updates land here.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {notifications.map((notif) => {
                    const presentation = getNotificationPresentation(notif);
                    const targetLink = notif.type === "calendar_assistant" ? "/calendar-assistant" : notif.link;
                    const content = (
                      <div
                        className={`rounded-2xl border px-3.5 py-3 transition-colors shadow-[0_8px_24px_rgba(0,0,0,0.22)] ${
                          !notif.isRead
                            ? "border-sky-200/20 bg-white/[0.11]"
                            : "border-white/12 bg-white/[0.07] hover:bg-white/[0.1]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${presentation.accent}`}>
                            {presentation.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="rounded-full border border-white/15 bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
                                {presentation.chip}
                              </span>
                              <span className="text-[11px] text-white/50">
                                {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            {notif.title ? <p className="line-clamp-1 text-sm font-semibold text-white">{notif.title}</p> : null}
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-white/85">{notif.message}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {!notif.isRead ? (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  markAsRead(notif.id);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-indigo-300 transition-colors hover:bg-indigo-500/15"
                                aria-label="Mark as read"
                                title="Mark as read"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            ) : null}
                            {targetLink ? <ChevronRight className="h-4 w-4 text-white/25" /> : null}
                          </div>
                        </div>
                      </div>
                    );

                    if (targetLink) {
                      return (
                        <PrefetchLink key={notif.id} href={targetLink} onClick={() => setIsOpen(false)}>
                          {content}
                        </PrefetchLink>
                      );
                    }

                    return <div key={notif.id}>{content}</div>;
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-[rgba(7,14,28,0.98)] px-4 py-3 sm:hidden">
              <PrefetchLink
                href="/settings/profile/notifications"
                onClick={() => setIsOpen(false)}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Manage Notification Settings
              </PrefetchLink>
            </div>

            <div className="hidden border-t border-white/10 bg-[rgba(7,14,28,0.98)] px-4 py-3 sm:block">
              <PrefetchLink
                href="/settings/profile/notifications"
                onClick={() => setIsOpen(false)}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Manage Notification Settings
              </PrefetchLink>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
