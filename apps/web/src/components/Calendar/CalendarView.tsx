"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  parseISO,
  startOfWeek as getWeekStart,
  addWeeks,
  subWeeks,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Tv,
  Clock,
  CheckCircle,
  Calendar as CalendarIcon,
  CalendarDays,
  List,
  ListOrdered,
  Filter,
  X,
  Loader2,
  Search,
  CheckCircle2,
  Download,
  Play
} from "lucide-react";
import { clsx } from "clsx";
import { GenreFilterDropdown } from "./GenreFilterDropdown";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "movie_release" | "tv_premiere" | "tv_episode" | "season_premiere"
        | "request_pending" | "request_approved"
        | "sonarr_monitored" | "radarr_monitored";
  tmdbId?: number;
  tvdbId?: number;
  posterPath?: string | null;
  backdropPath?: string | null;
  mediaType?: "movie" | "tv";
  metadata?: {
    overview?: string;
    voteAverage?: number;
    genres?: { id: number; name: string }[];
    episodeNumber?: number;
    seasonNumber?: number;
    monitored?: boolean;
    isAvailable?: boolean;
    jellyfinItemId?: string | null;
    sonarrSeriesId?: number;
    sonarrEpisodeId?: number;
    tvdbEpisodeId?: number;
    tmdbEpisodeId?: number;
    seriesType?: string;
    radarrMovieId?: number;
    requestId?: string;
    status?: string;
    baseTitle?: string;
  };
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

type ViewMode = "month" | "week" | "list" | "agenda";

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [filters, setFilters] = useState({
    movies: true,
    tv: true,
    requests: true,
    sonarr: true,
    radarr: true,
    monitoredOnly: false,
    availableOnly: false,
    genreFilters: [] as number[],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dayViewDate, setDayViewDate] = useState<Date | null>(null);
  const [feedCopied, setFeedCopied] = useState(false);

  // Calculate range for API fetch based on view mode
  const getDateRange = () => {
    if (viewMode === "week") {
      const weekStart = getWeekStart(currentDate, { weekStartsOn: 0 });
      const weekEnd = addWeeks(weekStart, 1);
      return {
        start: startOfWeek(weekStart),
        end: endOfWeek(weekEnd)
      };
    }
    // Month view (default)
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    return {
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd)
    };
  };

  const { start: calendarStart, end: calendarEnd } = getDateRange();

  // Fetch data for the visible range
  const { data, isLoading, mutate } = useSWR<{ events: CalendarEvent[] }>(
    `/api/calendar?start=${format(calendarStart, 'yyyy-MM-dd')}&end=${format(calendarEnd, 'yyyy-MM-dd')}`,
    fetcher,
    { revalidateOnFocus: false } // Don't revalidate on tab focus
  );

  const { data: feedData } = useSWR<{ httpsUrl: string; webcalUrl: string }>(
    "/api/calendar/feed",
    fetcher,
    { revalidateOnFocus: false }
  );

  const isIOS = () => {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  };

  // Prefetch adjacent months
  useEffect(() => {
    const prefetchNext = () => {
      const nextMonthStart = startOfMonth(addMonths(currentDate, 1));
      const nextMonthEnd = endOfMonth(addMonths(currentDate, 1));
      fetch(`/api/calendar?start=${format(startOfWeek(nextMonthStart), 'yyyy-MM-dd')}&end=${format(endOfWeek(nextMonthEnd), 'yyyy-MM-dd')}`);
    };

    const prefetchPrev = () => {
      const prevMonthStart = startOfMonth(subMonths(currentDate, 1));
      const prevMonthEnd = endOfMonth(subMonths(currentDate, 1));
      fetch(`/api/calendar?start=${format(startOfWeek(prevMonthStart), 'yyyy-MM-dd')}&end=${format(endOfWeek(prevMonthEnd), 'yyyy-MM-dd')}`);
    };

    if (!isLoading) {
      setTimeout(prefetchNext, 100);
      setTimeout(prefetchPrev, 200);
    }
  }, [currentDate, isLoading]);

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Enhanced filtering
  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];

    return data.events.filter(event => {
      // Type filters
      if (!filters.movies && (event.type === 'movie_release' || event.type === 'radarr_monitored')) return false;
      if (!filters.tv && (event.type === 'tv_premiere' || event.type === 'tv_episode' || event.type === 'season_premiere' || event.type === 'sonarr_monitored')) return false;
      if (!filters.requests && (event.type === 'request_pending' || event.type === 'request_approved')) return false;
      if (!filters.sonarr && event.type === 'sonarr_monitored') return false;
      if (!filters.radarr && event.type === 'radarr_monitored') return false;

      // Monitored filter
      if (filters.monitoredOnly && !event.metadata?.monitored) return false;

      // Available filter
      if (filters.availableOnly && !event.metadata?.isAvailable) return false;

      // Search filter
      if (searchQuery && !event.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      // Genre filter
      if (filters.genreFilters.length > 0) {
        const eventGenreIds = event.metadata?.genres?.map(g => g.id) || [];
        const hasMatchingGenre = filters.genreFilters.some(genreId => eventGenreIds.includes(genreId));
        if (!hasMatchingGenre) return false;
      }

      return true;
    });
  }, [data, filters, searchQuery]);

  const getEventsForDay = (day: Date) => {
    return filteredEvents.filter(event => isSameDay(parseISO(event.date), day));
  };

  const nextPeriod = () => {
    if (viewMode === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const prevPeriod = () => {
    if (viewMode === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const getEventColor = (type: string) => {
    switch (type) {
      case 'movie_release': return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case 'tv_premiere': return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case 'tv_episode': return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
      case 'season_premiere': return "bg-violet-500/20 text-violet-300 border-violet-500/30";
      case 'request_pending': return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      case 'request_approved': return "bg-green-500/20 text-green-300 border-green-500/30";
      case 'sonarr_monitored': return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
      case 'radarr_monitored': return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      default: return "bg-gray-700 text-gray-300";
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'movie_release':
      case 'radarr_monitored':
        return <Film className="w-3 h-3" />;
      case 'tv_premiere':
      case 'tv_episode':
      case 'season_premiere':
      case 'sonarr_monitored':
        return <Tv className="w-3 h-3" />;
      case 'request_pending': return <Clock className="w-3 h-3" />;
      case 'request_approved': return <CheckCircle className="w-3 h-3" />;
      default: return <CalendarIcon className="w-3 h-3" />;
    }
  };

  const getEventTypeLabel = (event: CalendarEvent) => {
    if (event.type === "sonarr_monitored" || event.type === "radarr_monitored") {
      if (event.metadata?.isAvailable) return "Available";
      if (event.metadata?.monitored === false) return "Coming soon";
      return "Monitoring";
    }

    const labels: Record<CalendarEvent["type"], string> = {
      movie_release: "Release",
      tv_premiere: "TV Premiere",
      tv_episode: "TV Episode",
      season_premiere: "Season Premiere",
      request_pending: "Request Pending",
      request_approved: "Request Approved",
      sonarr_monitored: "Monitoring",
      radarr_monitored: "Monitoring"
    };
    return labels[event.type] || event.type.replace(/_/g, " ");
  };

  if (viewMode === "list" || viewMode === "agenda") {
    return (
      <div className="space-y-6">
        <CalendarHeader
          currentDate={currentDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onPrevPeriod={prevPeriod}
          onNextPeriod={nextPeriod}
          onToday={goToToday}
          filters={filters}
          onFiltersChange={setFilters}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          feedUrl={feedData?.webcalUrl}
          feedCopied={feedCopied}
          onCopyFeed={async () => {
            if (!feedData?.webcalUrl) return;
            if (isIOS()) {
              window.location.href = feedData.webcalUrl;
              return;
            }
            try {
              await navigator.clipboard.writeText(feedData.webcalUrl);
              setFeedCopied(true);
              setTimeout(() => setFeedCopied(false), 1500);
            } catch {
              // Ignore clipboard failures silently
            }
          }}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : viewMode === "list" ? (
          <ListView events={filteredEvents} onEventClick={setSelectedEvent} getEventColor={getEventColor} getEventIcon={getEventIcon} />
        ) : (
          <AgendaView
            events={filteredEvents}
            onEventClick={setSelectedEvent}
            getEventColor={getEventColor}
            getEventIcon={getEventIcon}
            getEventTypeLabel={getEventTypeLabel}
          />
        )}

        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          getEventColor={getEventColor}
          getEventIcon={getEventIcon}
          getEventTypeLabel={getEventTypeLabel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <CalendarHeader
          currentDate={currentDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onPrevPeriod={prevPeriod}
          onNextPeriod={nextPeriod}
          onToday={goToToday}
          filters={filters}
          onFiltersChange={setFilters}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          feedUrl={feedData?.webcalUrl}
          feedCopied={feedCopied}
          onCopyFeed={async () => {
            if (!feedData?.webcalUrl) return;
            if (isIOS()) {
              window.location.href = feedData.webcalUrl;
              return;
            }
            try {
              await navigator.clipboard.writeText(feedData.webcalUrl);
              setFeedCopied(true);
              setTimeout(() => setFeedCopied(false), 1500);
            } catch {
              // Ignore clipboard failures silently
            }
          }}
        />

      {/* Calendar Grid */}
      <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-white/10 overflow-hidden shadow-xl">
        {/* Days Header */}
        <div className="hidden md:grid grid-cols-7 border-b border-white/10 bg-gray-800/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-3 text-center text-sm font-semibold text-gray-400">
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-1 md:grid-cols-7 auto-rows-fr bg-gray-800/20">
          {isLoading ? (
            <div className="col-span-7 flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            days.map((day, dayIdx) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isTodayDate = isToday(day);

              return (
                <div
                  key={day.toString()}
                  className={clsx(
                    "min-h-fit md:min-h-[120px] p-3 md:p-2 border-b md:border-r border-white/5 transition-colors hover:bg-white/[0.02] flex flex-row md:flex-col gap-4 md:gap-1 relative",
                    !isCurrentMonth && "bg-black/40 text-gray-700 opacity-40",
                    isTodayDate && "bg-primary/5"
                  )}
                >
                  <div className={clsx(
                    "text-sm font-medium w-8 h-8 md:w-7 md:h-7 flex items-center justify-center rounded-full md:mb-1 shrink-0",
                    isTodayDate ? "bg-primary text-primary-foreground shadow-sm" : "text-gray-400 bg-gray-800/50 md:bg-transparent",
                    !isCurrentMonth && "opacity-50"
                  )}>
                    {format(day, 'd')}
                  </div>

                  {/* Events List */}
                  <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map(event => (
                      <button
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        className={clsx(
                          "w-full text-left text-xs truncate px-2 py-1 rounded border transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-1.5 relative",
                          getEventColor(event.type)
                        )}
                      >
                        {getEventIcon(event.type)}
                        <span className="truncate font-medium flex-1">{event.title}</span>
                        {event.metadata?.isAvailable && (
                          <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" aria-label="Available in Jellyfin" />
                        )}
                      </button>
                    ))}

                    {dayEvents.length > 3 && (
                      <button
                        className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors text-center w-full mt-auto"
                        onClick={() => setDayViewDate(day)}
                      >
                        +{dayEvents.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Event Details Modal */}
      <EventDetailsModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        getEventColor={getEventColor}
        getEventIcon={getEventIcon}
        getEventTypeLabel={getEventTypeLabel}
      />

      {/* Day View Modal */}
      {dayViewDate && (
        <DayViewModal
          date={dayViewDate}
          events={getEventsForDay(dayViewDate)}
          onClose={() => setDayViewDate(null)}
          onEventClick={setSelectedEvent}
          getEventColor={getEventColor}
          getEventIcon={getEventIcon}
        />
      )}
    </div>
  );
}

// Calendar Header Component
function CalendarHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrevPeriod,
  onNextPeriod,
  onToday,
  filters,
  onFiltersChange,
  searchQuery,
  onSearchChange,
  feedUrl,
  feedCopied,
  onCopyFeed
}: any) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-primary" />
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-white/10">
            <button onClick={onPrevPeriod} className="p-1 hover:bg-white/10 rounded transition text-gray-400 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={onToday} className="px-3 text-sm font-medium text-gray-400 hover:text-white transition">
              Today
            </button>
            <button onClick={onNextPeriod} className="p-1 hover:bg-white/10 rounded transition text-gray-400 hover:text-white">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Mode Selector + Subscribe */}
        <div className="flex items-center gap-2">
          {feedUrl ? (
            <button
              onClick={onCopyFeed}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium border transition-all",
                feedCopied
                  ? "bg-emerald-500 text-black border-emerald-400"
                  : "bg-gray-800 text-gray-300 border-white/10 hover:text-white hover:bg-white/5"
              )}
              title="Copy iPhone calendar link"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{feedCopied ? "Copied" : "Subscribe"}</span>
            </button>
          ) : null}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1 border border-white/10">
            <ViewButton active={viewMode === "month"} onClick={() => onViewModeChange("month")} icon={CalendarIcon} label="Month" />
            <ViewButton active={viewMode === "week"} onClick={() => onViewModeChange("week")} icon={CalendarDays} label="Week" />
            <ViewButton active={viewMode === "list"} onClick={() => onViewModeChange("list")} icon={List} label="List" />
            <ViewButton active={viewMode === "agenda"} onClick={() => onViewModeChange("agenda")} icon={ListOrdered} label="Agenda" />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 mr-1" />
          <FilterButton active={filters.movies} onClick={() => onFiltersChange({...filters, movies: !filters.movies})} label="Movies" color="blue" />
          <FilterButton active={filters.tv} onClick={() => onFiltersChange({...filters, tv: !filters.tv})} label="TV" color="purple" />
          <FilterButton active={filters.requests} onClick={() => onFiltersChange({...filters, requests: !filters.requests})} label="Requests" color="yellow" />
          <FilterButton active={filters.sonarr} onClick={() => onFiltersChange({...filters, sonarr: !filters.sonarr})} label="Sonarr" color="cyan" />
          <FilterButton active={filters.radarr} onClick={() => onFiltersChange({...filters, radarr: !filters.radarr})} label="Radarr" color="emerald" />
          <GenreFilterDropdown
            selectedGenres={filters.genreFilters}
            onGenresChange={(genreIds) => onFiltersChange({...filters, genreFilters: genreIds})}
            mediaType="all"
          />
        </div>
      </div>
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-all",
        active ? "bg-primary text-primary-foreground" : "text-gray-400 hover:text-white hover:bg-white/5"
      )}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FilterButton({ active, onClick, label, color }: { active: boolean, onClick: () => void, label: string, color: string }) {
  const colors: any = {
    blue: "bg-blue-500 text-white border-blue-400",
    purple: "bg-purple-500 text-white border-purple-400",
    yellow: "bg-yellow-500 text-black border-yellow-400",
    cyan: "bg-cyan-500 text-white border-cyan-400",
    emerald: "bg-emerald-500 text-white border-emerald-400",
  };

  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
        active ? colors[color] : "bg-transparent text-gray-400 border-gray-700 hover:border-gray-500"
      )}
    >
      {label}
    </button>
  );
}

// Simple List View
function ListView({ events, onEventClick, getEventColor, getEventIcon }: any) {
  const groupedByDate = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {};
    events.forEach((event: CalendarEvent) => {
      if (!groups[event.date]) groups[event.date] = [];
      groups[event.date].push(event);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  return (
    <div className="space-y-6">
      {groupedByDate.map(([date, dayEvents]) => (
        <div key={date} className="space-y-2">
          <h3 className="text-lg font-semibold text-white sticky top-0 bg-gray-900/90 backdrop-blur py-2 z-10">
            {format(parseISO(date), 'EEEE, MMMM do, yyyy')}
          </h3>
          <div className="space-y-2">
            {dayEvents.map((event: CalendarEvent) => (
              <button
                key={event.id}
                onClick={() => onEventClick(event)}
                className={clsx(
                  "w-full text-left p-4 rounded-lg border transition-all hover:scale-[1.01]",
                  getEventColor(event.type)
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getEventIcon(event.type)}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{event.title}</h4>
                    {event.metadata?.overview && (
                      <p className="text-xs opacity-70 mt-1 line-clamp-2">{event.metadata.overview}</p>
                    )}
                  </div>
                  {event.metadata?.isAvailable && (
                    <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {groupedByDate.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          No events found
        </div>
      )}
    </div>
  );
}

// Simple Agenda View
function AgendaView({ events, onEventClick, getEventColor, getEventIcon, getEventTypeLabel }: any) {
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.date.localeCompare(b.date));
  }, [events]);

  return (
    <div className="bg-gray-900/50 rounded-xl border border-white/10 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-800/50 border-b border-white/10">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Date</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Event</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Type</th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sortedEvents.map((event: CalendarEvent) => (
            <tr
              key={event.id}
              onClick={() => onEventClick(event)}
              className="hover:bg-white/5 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 text-sm text-gray-300">
                {format(parseISO(event.date), 'MMM dd, yyyy')}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {getEventIcon(event.type)}
                  <span className="text-sm font-medium text-white truncate">{event.title}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={clsx("px-2 py-1 rounded text-xs", getEventColor(event.type))}>
                  {getEventTypeLabel(event)}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                {event.metadata?.isAvailable && <CheckCircle2 className="w-4 h-4 text-green-400 inline" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sortedEvents.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          No events found
        </div>
      )}
    </div>
  );
}

// Day View Modal
function DayViewModal({ date, events, onClose, onEventClick, getEventColor, getEventIcon }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              {format(date, 'MMMM do, yyyy')}
            </h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-gray-400 mt-1">{events.length} events</p>
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-6 space-y-3">
          {events.map((event: CalendarEvent) => (
            <button
              key={event.id}
              onClick={() => { onEventClick(event); onClose(); }}
              className={clsx(
                "w-full text-left p-4 rounded-lg border transition-all hover:scale-[1.02]",
                getEventColor(event.type)
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">{getEventIcon(event.type)}</div>
                <div className="flex-1">
                  <h4 className="font-medium">{event.title}</h4>
                  {event.metadata?.overview && (
                    <p className="text-xs opacity-70 mt-1 line-clamp-2">{event.metadata.overview}</p>
                  )}
                </div>
                {event.metadata?.isAvailable && (
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Event Details Modal
function EventDetailsModal({ event, onClose, getEventColor, getEventIcon, getEventTypeLabel }: any) {
  if (!event) return null;

  const posterSrc = event.posterPath
    ? event.posterPath.startsWith("http")
      ? event.posterPath
      : `https://image.tmdb.org/t/p/w500${event.posterPath}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="relative aspect-video bg-gray-800">
           {posterSrc ? (
             <Image
               src={posterSrc}
               alt={event.title}
               fill
               className="object-cover opacity-60"
               unoptimized
             />
           ) : (
             <div className="w-full h-full flex items-center justify-center text-gray-600">
               <Film className="w-12 h-12" />
             </div>
           )}
           <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
           <button
             onClick={onClose}
             className="absolute top-2 right-2 p-2 bg-black/40 rounded-full text-white hover:bg-black/60 transition"
           >
             <X className="w-5 h-5" />
           </button>
           <div className="absolute bottom-4 left-4 right-4">
             <h3 className="text-xl font-bold text-white leading-tight drop-shadow-md">{event.title}</h3>
             <p className="text-gray-300 text-sm mt-1 flex items-center gap-2">
               {getEventIcon(event.type)}
               {format(parseISO(event.date), 'MMMM do, yyyy')}
             </p>
           </div>
        </div>

        <div className="p-6 space-y-4">
           <div className="flex items-center gap-2 text-sm flex-wrap">
             <span className={clsx("px-2 py-1 rounded-full border", getEventColor(event.type))}>
               {getEventTypeLabel(event).toUpperCase()}
             </span>
             {event.mediaType && (
               <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-400 border border-white/10 uppercase text-xs">
                 {event.mediaType}
               </span>
             )}
             {event.metadata?.isAvailable && (
               <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-300 border border-green-500/30 text-xs flex items-center gap-1">
                 <CheckCircle2 className="w-3 h-3" />
                 Available
               </span>
             )}
           </div>

           {event.metadata?.overview && (
             <p className="text-gray-400 text-sm leading-relaxed">
               {event.metadata.overview}
             </p>
           )}

           {event.type.includes('request') && event.metadata?.status && (
             <div className="text-sm text-gray-500 bg-gray-800/50 p-3 rounded-lg border border-white/5">
                Request Status: <span className="text-white capitalize">{event.metadata.status}</span>
             </div>
           )}

           {(event.tmdbId || event.metadata?.tmdbId) && (
              <Link
                href={`/${(event.mediaType || (event.type === 'movie_release' ? 'movie' : 'tv'))}/${event.tmdbId || event.metadata?.tmdbId}`}
                className="mt-4 flex items-center justify-center gap-2 w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors"
              >
                {event.mediaType === 'tv' || event.type.includes('tv') ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                View {event.mediaType === 'tv' || event.type.includes('tv') ? 'Show' : 'Movie'}
              </Link>
           )}
        </div>
      </div>
    </div>
  );
}
