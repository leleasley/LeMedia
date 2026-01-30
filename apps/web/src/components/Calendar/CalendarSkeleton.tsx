"use client";

import { clsx } from "clsx";

/**
 * Animated skeleton loader for calendar view
 * Shows the calendar grid structure while data is loading
 */
export function CalendarSkeleton() {
  const daysInWeek = 7;
  const weeksToShow = 5;

  return (
    <div className="animate-pulse">
      {/* Header Skeleton */}
      <div className="mb-6 space-y-4">
        <div className="flex items-center justify-between">
          {/* Title and navigation */}
          <div className="flex items-center gap-4">
            <div className="h-8 w-48 rounded bg-gray-800" />
            <div className="flex gap-2">
              <div className="h-10 w-32 rounded-lg bg-gray-800" />
            </div>
          </div>

          {/* View mode buttons */}
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 w-20 rounded-lg bg-gray-800" />
            ))}
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex gap-3">
          <div className="h-10 flex-1 rounded-lg bg-gray-800" />
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 w-20 rounded-full bg-gray-800" />
            ))}
          </div>
        </div>
      </div>

      {/* Calendar Grid Skeleton */}
      <div className="rounded-lg border border-white/10 bg-gray-900/50 overflow-hidden">
        {/* Week day headers */}
        <div className="grid grid-cols-7 border-b border-white/10 bg-gray-800/30">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="border-r border-white/10 px-3 py-2 text-center text-sm font-medium text-gray-400 last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7">
          {Array.from({ length: daysInWeek * weeksToShow }).map((_, index) => (
            <div
              key={index}
              className={clsx(
                "relative min-h-[120px] border-r border-b border-white/10 p-2",
                index % 7 === 6 && "border-r-0",
                index >= daysInWeek * (weeksToShow - 1) && "border-b-0"
              )}
            >
              {/* Day number skeleton */}
              <div className="mb-2 h-6 w-8 rounded bg-gray-800" />

              {/* Event skeletons (randomize 0-3 events per day) */}
              {Array.from({
                length: (index * 3 + 1) % 4,
              }).map((_, eventIndex) => (
                <div
                  key={eventIndex}
                  className="mb-1.5 h-8 rounded bg-gray-800/70"
                  style={{
                    animationDelay: `${(index * 50 + eventIndex * 100) % 1000}ms`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for list view mode
 */
export function CalendarListSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded bg-gray-800" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-20 rounded-lg bg-gray-800" />
          ))}
        </div>
      </div>

      {/* List items */}
      {[1, 2, 3, 4, 5].map((dayIndex) => (
        <div key={dayIndex}>
          {/* Date header */}
          <div className="mb-3 h-6 w-32 rounded bg-gray-800" />

          {/* Events for this date */}
          <div className="space-y-2">
            {[1, 2, 3].map((eventIndex) => (
              <div
                key={eventIndex}
                className="flex items-center gap-4 rounded-lg border border-white/10 bg-gray-900/50 p-4"
              >
                {/* Poster placeholder */}
                <div className="h-16 w-12 flex-shrink-0 rounded bg-gray-800" />

                {/* Content */}
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-3/4 rounded bg-gray-800" />
                  <div className="h-4 w-1/2 rounded bg-gray-800/70" />
                </div>

                {/* Action button */}
                <div className="h-8 w-8 rounded-full bg-gray-800" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for agenda view mode
 */
export function CalendarAgendaSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header Skeleton */}
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-48 rounded bg-gray-800" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-20 rounded-lg bg-gray-800" />
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-white/10 bg-gray-900/50">
        {/* Table header */}
        <div className="grid grid-cols-12 border-b border-white/10 bg-gray-800/30">
          <div className="col-span-2 p-3">
            <div className="h-4 w-16 rounded bg-gray-800" />
          </div>
          <div className="col-span-1 p-3">
            <div className="h-4 w-12 rounded bg-gray-800" />
          </div>
          <div className="col-span-6 p-3">
            <div className="h-4 w-20 rounded bg-gray-800" />
          </div>
          <div className="col-span-2 p-3">
            <div className="h-4 w-16 rounded bg-gray-800" />
          </div>
          <div className="col-span-1 p-3">
            <div className="h-4 w-16 rounded bg-gray-800" />
          </div>
        </div>

        {/* Table rows */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <div
            key={index}
            className="grid grid-cols-12 border-b border-white/10 last:border-b-0"
          >
            <div className="col-span-2 p-3">
              <div className="h-4 w-20 rounded bg-gray-800/70" />
            </div>
            <div className="col-span-1 p-3">
              <div className="h-6 w-12 rounded-full bg-gray-800/70" />
            </div>
            <div className="col-span-6 p-3">
              <div className="h-4 w-full rounded bg-gray-800/70" />
            </div>
            <div className="col-span-2 p-3">
              <div className="h-4 w-16 rounded bg-gray-800/70" />
            </div>
            <div className="col-span-1 p-3">
              <div className="h-8 w-8 rounded-full bg-gray-800/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
