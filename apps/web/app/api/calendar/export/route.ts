import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getCalendarFeedUserByToken } from "@/db";
import ical, { ICalCalendar, ICalCategoryData, ICalEventData, ICalEventStatus } from "ical-generator";
import { CalendarEvent } from "../route";
import { format, addDays } from "date-fns";

/**
 * Generate iCal/ICS file for calendar subscription
 * GET /api/calendar/export
 *
 * Query params:
 * - days: number of days to include (default: 90)
 * - format: 'ics' for download, 'webcal' for subscription URL
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get("token");
    const user = token ? await getCalendarFeedUserByToken(token) : await getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Date range: today to N days in future
    const daysAhead = parseInt(searchParams.get("days") || "90", 10);
    const today = new Date();
    const publicBaseUrl = (process.env.APP_BASE_URL || req.nextUrl.origin).replace(/\/+$/, "");
    const internalBaseUrl =
      (process.env.INTERNAL_APP_BASE_URL || req.nextUrl.origin).replace(/\/+$/, "").replace(/^https:/, "http:");
    const start = format(today, "yyyy-MM-dd");
    const end = format(addDays(today, daysAhead), "yyyy-MM-dd");

    // Fetch calendar events (reuse existing calendar API logic)
    const calendarUrl = new URL("/api/calendar", internalBaseUrl);
    calendarUrl.searchParams.set("start", start);
    calendarUrl.searchParams.set("end", end);
    calendarUrl.searchParams.set("jellyfin", "false"); // Skip availability check for export
    if (token) {
      calendarUrl.searchParams.set("token", token);
    }

    const response = await fetch(calendarUrl.toString(), token ? undefined : {
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch calendar events");
    }

    const data = await response.json();
    const events: CalendarEvent[] = data.events || [];

    // Create iCal calendar
    const calendar: ICalCalendar = ical({
      name: `${user.username}'s LeMedia Calendar`,
      description: `Personal media release calendar for ${user.username}`,
      timezone: "UTC",
      prodId: {
        company: "LeMedia",
        product: "Calendar",
        language: "EN",
      },
      url: `${publicBaseUrl}/calendar`,
      ttl: 3600, // 1 hour TTL for webcal subscriptions
    });

    // Add events to calendar
    events.forEach((event) => {
      const eventData: ICalEventData = {
        start: new Date(event.date),
        summary: event.title,
        description: generateEventDescription(event),
        url: generateEventUrl(publicBaseUrl, event),
        id: event.id,
        allDay: true,
      };

      // Add categories based on event type
      const categories: ICalCategoryData[] = [];
      if (event.type.includes("movie")) categories.push({ name: "Movies" });
      if (event.type.includes("tv") || event.type.includes("season")) categories.push({ name: "TV Shows" });
      if (event.type.includes("request")) categories.push({ name: "Requests" });
      if (event.type.includes("sonarr")) categories.push({ name: "Sonarr" });
      if (event.type.includes("radarr")) categories.push({ name: "Radarr" });
      if (categories.length > 0) {
        eventData.categories = categories;
      }

      // Add status for requests
      if (event.type === "request_pending") {
        eventData.status = ICalEventStatus.TENTATIVE;
      } else if (event.type === "request_approved") {
        eventData.status = ICalEventStatus.CONFIRMED;
      }

      // Add location if available in Jellyfin
      if (event.metadata?.isAvailable && event.metadata?.jellyfinItemId) {
        eventData.location = "Available in Jellyfin";
      }

      calendar.createEvent(eventData);
    });

    // Generate ICS content
    const icsContent = calendar.toString();

    // Return as downloadable file
    const inline = searchParams.get("format") === "webcal" || Boolean(token);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": inline
          ? `inline; filename="lemedia-calendar-${user.username}.ics"`
          : `attachment; filename="lemedia-calendar-${user.username}.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[Calendar Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export calendar" },
      { status: 500 }
    );
  }
}

/**
 * Generate event description with metadata
 */
function generateEventDescription(event: CalendarEvent): string {
  const parts: string[] = [];

  // Event type
  const typeLabels: Record<string, string> = {
    movie_release: "Movie Release",
    tv_premiere: "TV Premiere",
    tv_episode: "TV Episode",
    season_premiere: "Season Premiere",
    request_pending: "Pending Request",
    request_approved: "Approved Request",
    sonarr_monitored: "Scheduled via Sonarr",
    radarr_monitored: "Scheduled via Radarr",
  };
  parts.push(`Type: ${typeLabels[event.type] || event.type}`);

  // Overview
  if (event.metadata?.overview) {
    parts.push(`\n${event.metadata.overview}`);
  }

  // Episode/Season info
  if (event.metadata?.seasonNumber) {
    parts.push(`\nSeason ${event.metadata.seasonNumber}`);
    if (event.metadata?.episodeNumber) {
      parts.push(` Episode ${event.metadata.episodeNumber}`);
    }
  }

  // Rating
  if (event.metadata?.voteAverage) {
    parts.push(`\nRating: ${event.metadata.voteAverage.toFixed(1)}/10`);
  }

  // Availability
  if (event.metadata?.isAvailable) {
    parts.push("\n\n✓ Available in Jellyfin");
  }
  if (event.type === "sonarr_monitored") {
    parts.push("\n• Managed by Sonarr");
  }
  if (event.type === "radarr_monitored") {
    parts.push("\n• Managed by Radarr");
  }

  return parts.join("");
}

/**
 * Generate URL to event details page
 */
function generateEventUrl(origin: string, event: CalendarEvent): string {
  if (!event.tmdbId || !event.mediaType) {
    return `${origin}/calendar`;
  }

  if (event.mediaType === "movie") {
    return `${origin}/movie/${event.tmdbId}`;
  } else if (event.mediaType === "tv") {
    return `${origin}/tv/${event.tmdbId}`;
  }

  return `${origin}/calendar`;
}
