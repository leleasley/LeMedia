"use client";

import { useState, useMemo } from "react";
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
  parseISO 
} from "date-fns";
import { 
  ChevronLeft, 
  ChevronRight, 
  Film, 
  Tv, 
  Clock, 
  CheckCircle, 
  Calendar as CalendarIcon,
  Filter,
  X,
  Loader2
} from "lucide-react";
import { clsx } from "clsx";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "movie_release" | "tv_premiere" | "request_pending" | "request_approved";
  tmdbId?: number;
  posterPath?: string | null;
  mediaType?: "movie" | "tv";
  metadata?: any;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filters, setFilters] = useState({
    movies: true,
    tv: true,
    requests: true
  });
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Calculate range for API fetch
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart); // Start from previous month's days if needed
  const calendarEnd = endOfWeek(monthEnd);     // End with next month's days if needed

  // Fetch data for the visible range
  const { data, isLoading } = useSWR<{ events: CalendarEvent[] }>(
    `/api/calendar?start=${format(calendarStart, 'yyyy-MM-dd')}&end=${format(calendarEnd, 'yyyy-MM-dd')}`, 
    fetcher
  );

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const events = useMemo(() => {
    if (!data?.events) return [];
    return data.events.filter(event => {
      if (!filters.movies && event.type === 'movie_release') return false;
      if (!filters.tv && event.type === 'tv_premiere') return false;
      if (!filters.requests && (event.type === 'request_pending' || event.type === 'request_approved')) return false;
      return true;
    });
  }, [data, filters]);

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(parseISO(event.date), day));
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  const getEventColor = (type: string) => {
    switch (type) {
      case 'movie_release': return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case 'tv_premiere': return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case 'request_pending': return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      case 'request_approved': return "bg-green-500/20 text-green-300 border-green-500/30";
      default: return "bg-gray-700 text-gray-300";
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'movie_release': return <Film className="w-3 h-3" />;
      case 'tv_premiere': return <Tv className="w-3 h-3" />;
      case 'request_pending': return <Clock className="w-3 h-3" />;
      case 'request_approved': return <CheckCircle className="w-3 h-3" />;
      default: return <CalendarIcon className="w-3 h-3" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-primary" />
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-white/10">
            <button onClick={prevMonth} className="p-1 hover:bg-white/10 rounded transition text-gray-400 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={goToToday} className="px-3 text-sm font-medium text-gray-400 hover:text-white transition">
              Today
            </button>
            <button onClick={nextMonth} className="p-1 hover:bg-white/10 rounded transition text-gray-400 hover:text-white">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 mr-1" />
          <FilterButton 
            active={filters.movies} 
            onClick={() => setFilters(f => ({ ...f, movies: !f.movies }))}
            label="Movies"
            color="blue"
          />
          <FilterButton 
            active={filters.tv} 
            onClick={() => setFilters(f => ({ ...f, tv: !f.tv }))}
            label="TV Shows"
            color="purple"
          />
          <FilterButton 
            active={filters.requests} 
            onClick={() => setFilters(f => ({ ...f, requests: !f.requests }))}
            label="My Requests"
            color="yellow"
          />
        </div>
      </div>

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
          {days.map((day, dayIdx) => {
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
                  {isLoading && dayIdx === 0 && (
                     <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm z-10">
                       <Loader2 className="w-6 h-6 animate-spin text-primary" />
                     </div>
                  )}
                  
                  {dayEvents.slice(0, 3).map(event => (
                    <button
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      className={clsx(
                        "w-full text-left text-xs truncate px-2 py-1 rounded border transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-1.5",
                        getEventColor(event.type)
                      )}
                    >
                      {getEventIcon(event.type)}
                      <span className="truncate font-medium">{event.title}</span>
                    </button>
                  ))}
                  
                  {dayEvents.length > 3 && (
                    <button 
                      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors text-center w-full mt-auto"
                      onClick={() => {
                        // Ideally open a day view or just expand
                        // For now we'll pick the 4th event to show details as a workaround or just do nothing
                        // A better UX would be a 'View All' modal for the day
                        const firstHidden = dayEvents[3];
                        if (firstHidden) setSelectedEvent(firstHidden);
                      }}
                    >
                      +{dayEvents.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedEvent(null)}>
          <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="relative aspect-video bg-gray-800">
               {selectedEvent.posterPath ? (
                 <Image 
                   src={`https://image.tmdb.org/t/p/w500${selectedEvent.posterPath}`} 
                   alt={selectedEvent.title}
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
                 onClick={() => setSelectedEvent(null)}
                 className="absolute top-2 right-2 p-2 bg-black/40 rounded-full text-white hover:bg-black/60 transition"
               >
                 <X className="w-5 h-5" />
               </button>
               <div className="absolute bottom-4 left-4 right-4">
                 <h3 className="text-xl font-bold text-white leading-tight drop-shadow-md">{selectedEvent.title}</h3>
                 <p className="text-gray-300 text-sm mt-1 flex items-center gap-2">
                   {getEventIcon(selectedEvent.type)}
                   {format(parseISO(selectedEvent.date), 'MMMM do, yyyy')}
                 </p>
               </div>
            </div>
            
            <div className="p-6 space-y-4">
               <div className="flex items-center gap-2 text-sm">
                 <span className={clsx("px-2 py-1 rounded-full border", getEventColor(selectedEvent.type))}>
                   {selectedEvent.type.replace('_', ' ').toUpperCase()}
                 </span>
                 {selectedEvent.mediaType && (
                   <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-400 border border-white/10 uppercase text-xs">
                     {selectedEvent.mediaType}
                   </span>
                 )}
               </div>

               {selectedEvent.metadata?.overview && (
                 <p className="text-gray-400 text-sm leading-relaxed">
                   {selectedEvent.metadata.overview}
                 </p>
               )}
               
               {selectedEvent.type.includes('request') && (
                 <div className="text-sm text-gray-500 bg-gray-800/50 p-3 rounded-lg border border-white/5">
                    Request Status: <span className="text-white capitalize">{selectedEvent.metadata?.status}</span>
                 </div>
               )}

               {(selectedEvent.tmdbId || selectedEvent.metadata?.tmdbId) && (
                  <Link
                    href={`/${(selectedEvent.mediaType || (selectedEvent.type === 'movie_release' ? 'movie' : 'tv'))}/${selectedEvent.tmdbId || selectedEvent.metadata?.tmdbId}`}
                    className="mt-4 flex items-center justify-center gap-2 w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors"
                  >
                    {selectedEvent.mediaType === 'tv' || selectedEvent.type === 'tv_premiere' ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                    View {selectedEvent.mediaType === 'tv' || selectedEvent.type === 'tv_premiere' ? 'Show' : 'Movie'}
                  </Link>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, label, color }: { active: boolean, onClick: () => void, label: string, color: 'blue' | 'purple' | 'yellow' }) {
  const colors = {
    blue: "bg-blue-500 text-white border-blue-400",
    purple: "bg-purple-500 text-white border-purple-400",
    yellow: "bg-yellow-500 text-black border-yellow-400",
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