"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Users } from "lucide-react";
import { Modal } from "@/components/Common/Modal";

export type CastItem = {
  id: number;
  name: string;
  role?: string | null;
  profileUrl?: string | null;
};

type MediaCastScrollerProps = {
  title?: string;
  items: CastItem[];
  crewItems?: CastItem[];
  guestItems?: CastItem[];
  previewCount?: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/g).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function MediaCastScroller({
  title = "Cast",
  items,
  crewItems = [],
  guestItems = [],
  previewCount = 12
}: MediaCastScrollerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"cast" | "crew" | "guest">("cast");
  const hasMore = items.length > previewCount || crewItems.length > 0 || guestItems.length > 0;
  const previewItems = useMemo(() => items.slice(0, previewCount), [items, previewCount]);
  const availableTabs = useMemo(() => {
    const tabs: Array<{ key: "cast" | "crew" | "guest"; label: string; count: number }> = [];
    if (items.length > 0) tabs.push({ key: "cast", label: "Cast", count: items.length });
    if (crewItems.length > 0) tabs.push({ key: "crew", label: "Crew", count: crewItems.length });
    if (guestItems.length > 0) tabs.push({ key: "guest", label: "Guest Stars", count: guestItems.length });
    return tabs;
  }, [items.length, crewItems.length, guestItems.length]);
  const activeItems = activeTab === "crew" ? crewItems : activeTab === "guest" ? guestItems : items;

  if (items.length === 0) return null;

  return (
    <div className="media-section">
      <div className="flex items-center justify-between">
        <h2 className="media-section-title">
          <Users className="h-4 w-4 sm:h-5 sm:w-5" />
          {title}
        </h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => {
              setActiveTab("cast");
              setOpen(true);
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            View all
          </button>
        )}
      </div>

      <div className="media-cast-scroll">
        {previewItems.map((person) => {
          const label = person.role ? `${person.name} as ${person.role}` : person.name;
          return (
            <Link
              key={person.id}
              href={`/person/${person.id}`}
              aria-label={`View ${label}`}
              className="media-cast-card group"
            >
              <div className="cast-image">
                {person.profileUrl ? (
                  <Image
                    src={person.profileUrl}
                    alt={person.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-semibold text-xs sm:text-sm">
                    {initials(person.name)}
                  </div>
                )}
                <div className="cast-overlay">
                  <span className="cast-name">{person.name}</span>
                  {person.role && <span className="cast-character">{person.role}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <Modal open={open} title={`${title} - Full Credits`} onClose={() => setOpen(false)}>
        <div className="space-y-4">
          {availableTabs.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {availableTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    activeTab === tab.key
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {tab.label} <span className="text-[10px] text-gray-400">({tab.count})</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{activeItems.length} {activeTab === "crew" ? "crew" : activeTab === "guest" ? "guests" : "cast"}</span>
            <span className="hidden sm:inline">Click a card for details</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {activeItems.map((person) => (
              <Link
                key={person.id}
                href={`/person/${person.id}`}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/[0.03] to-transparent p-3 transition hover:-translate-y-0.5 hover:border-white/25"
                onClick={() => setOpen(false)}
              >
                <div className="relative mb-3 aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  {person.profileUrl ? (
                    <Image
                      src={person.profileUrl}
                      alt={person.name}
                      fill
                      className="object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm font-semibold">
                      {initials(person.name)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white group-hover:text-white">
                    {person.name}
                  </div>
                  {person.role && <div className="truncate text-xs text-gray-400">{person.role}</div>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
