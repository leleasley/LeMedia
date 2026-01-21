/**
 * SHARED MEDIA STATUS UTILITIES
 * ==============================
 *
 * This file is the SINGLE SOURCE OF TRUTH for all media availability status logic.
 *
 * If you need to:
 * - Check if a series is partially available
 * - Map a status string to MediaStatus enum
 * - Get status display colors/labels
 *
 * USE THIS FILE. Do not duplicate logic elsewhere.
 *
 * Used by:
 * - request-sync.ts (syncing request statuses)
 * - library-availability.ts (availability API)
 * - api/library/recent/route.ts (recently added)
 * - StatusBadgeMini component (UI badges)
 * - Various UI components for status display
 */

// ============================================================================
// MEDIA STATUS ENUM
// ============================================================================

export enum MediaStatus {
  UNKNOWN = 1,
  PENDING = 2,
  PROCESSING = 3,
  PARTIALLY_AVAILABLE = 4,
  AVAILABLE = 5,
  BLACKLISTED = 6,
  DELETED = 7,
  DOWNLOADING = 8,
}

// ============================================================================
// STATUS STRING CONSTANTS
// ============================================================================

export const STATUS_STRINGS = {
  AVAILABLE: "available",
  PARTIALLY_AVAILABLE: "partially_available",
  UNAVAILABLE: "unavailable",
  DOWNLOADING: "downloading",
  SUBMITTED: "submitted",
  PENDING: "pending",
  DENIED: "denied",
  FAILED: "failed",
  REMOVED: "removed",
  ALREADY_EXISTS: "already_exists",
} as const;

export type AvailabilityStatus = "available" | "partially_available" | "unavailable";
export type RequestStatus = typeof STATUS_STRINGS[keyof typeof STATUS_STRINGS];

// ============================================================================
// SERIES PARTIAL AVAILABILITY DETECTION
// ============================================================================

export interface SeriesStatistics {
  episodeCount?: number;
  totalEpisodeCount?: number;
  episodeFileCount?: number;
  sizeOnDisk?: number;
}

export interface SeasonData {
  seasonNumber?: number;
  statistics?: SeriesStatistics;
}

export interface SeriesData {
  statistics?: SeriesStatistics;
  seasons?: SeasonData[];
}

/**
 * Determines if a series is partially available based on Sonarr series data.
 *
 * A series is considered PARTIALLY AVAILABLE if:
 * 1. It has some episode files (episodeFileCount > 0)
 * 2. AND it doesn't have all episodes (episodeFileCount < totalEpisodeCount)
 * 3. OR any individual season has some but not all episodes
 *
 * @param series - Sonarr series object with statistics and seasons
 * @returns true if partially available, false otherwise
 */
export function isSeriesPartiallyAvailable(series: SeriesData | null | undefined): boolean {
  if (!series) return false;

  const stats = series.statistics || {};
  const totalEpisodes = Number(stats.totalEpisodeCount) || Number(stats.episodeCount) || 0;
  const episodeFileCount = Number(stats.episodeFileCount) || 0;

  // Check series-level partial
  if (episodeFileCount > 0 && episodeFileCount < totalEpisodes) {
    return true;
  }

  // Check season-level partial
  const seasons = Array.isArray(series.seasons) ? series.seasons : [];
  const hasPartialSeason = seasons.some((season) => {
    const seasonStats = season.statistics || {};
    const seasonTotal = Number(seasonStats.totalEpisodeCount) || Number(seasonStats.episodeCount) || 0;
    const seasonFiles = Number(seasonStats.episodeFileCount) || 0;
    // Only check seasons with episodes (skip specials/empty seasons)
    return seasonTotal > 0 && seasonFiles > 0 && seasonFiles < seasonTotal;
  });

  return hasPartialSeason;
}

/**
 * Determines if a series has any files at all.
 *
 * @param series - Sonarr series object with statistics
 * @returns true if has any files, false otherwise
 */
export function seriesHasFiles(series: SeriesData | null | undefined): boolean {
  if (!series) return false;
  const stats = series.statistics || {};
  return (Number(stats.episodeFileCount) || 0) > 0 || (Number(stats.sizeOnDisk) || 0) > 0;
}

/**
 * Gets the availability status for a series.
 *
 * @param series - Sonarr series object
 * @returns "available" | "partially_available" | "unavailable"
 */
export function getSeriesAvailabilityStatus(series: SeriesData | null | undefined): AvailabilityStatus {
  if (!series) return "unavailable";

  const hasFiles = seriesHasFiles(series);
  if (!hasFiles) return "unavailable";

  if (isSeriesPartiallyAvailable(series)) return "partially_available";

  return "available";
}

// ============================================================================
// STATUS STRING TO ENUM MAPPING
// ============================================================================

/**
 * Maps a status string to MediaStatus enum value.
 * Use this for consistent mapping across all UI components.
 *
 * @param status - Status string (e.g., "available", "partially_available")
 * @returns MediaStatus enum value or undefined if not mappable
 */
export function statusToMediaStatus(status: string | null | undefined): MediaStatus | undefined {
  if (!status) return undefined;

  switch (status.toLowerCase()) {
    case "available":
    case "completed":
      return MediaStatus.AVAILABLE;
    case "partially_available":
      return MediaStatus.PARTIALLY_AVAILABLE;
    case "downloading":
      return MediaStatus.DOWNLOADING;
    case "pending":
      return MediaStatus.PENDING;
    case "submitted":
    case "processing":
      return MediaStatus.PROCESSING;
    case "deleted":
    case "removed":
      return MediaStatus.DELETED;
    case "blacklisted":
    case "denied":
      return MediaStatus.BLACKLISTED;
    default:
      return undefined;
  }
}

/**
 * Maps an availability status string to MediaStatus enum.
 * Specifically for availability API responses.
 *
 * @param status - "available" | "partially_available" | "unavailable"
 * @returns MediaStatus enum value or undefined
 */
export function availabilityToMediaStatus(status: AvailabilityStatus | string | null | undefined): MediaStatus | undefined {
  if (!status) return undefined;

  switch (status) {
    case "available":
      return MediaStatus.AVAILABLE;
    case "partially_available":
      return MediaStatus.PARTIALLY_AVAILABLE;
    case "unavailable":
    default:
      return undefined;
  }
}

// ============================================================================
// STATUS DISPLAY CONFIGURATION
// ============================================================================

export interface StatusDisplayConfig {
  label: string;
  color: string;        // Text color class
  bgColor: string;      // Background color class
  borderColor: string;  // Border color class
  icon: string;         // Icon identifier
}

/**
 * Gets display configuration for a status.
 * Use this for consistent styling across UI components.
 */
export function getStatusDisplayConfig(status: string): StatusDisplayConfig {
  switch (status.toLowerCase()) {
    case "available":
    case "completed":
      return {
        label: "Available",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30",
        icon: "check",
      };
    case "partially_available":
      return {
        label: "Partially Available",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10",
        borderColor: "border-purple-500/30",
        icon: "half",
      };
    case "downloading":
      return {
        label: "Downloading",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
        icon: "download",
      };
    case "submitted":
      return {
        label: "Submitted",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/30",
        icon: "sparkle",
      };
    case "pending":
      return {
        label: "Pending",
        color: "text-sky-400",
        bgColor: "bg-sky-500/10",
        borderColor: "border-sky-500/30",
        icon: "clock",
      };
    case "denied":
    case "failed":
      return {
        label: status === "denied" ? "Denied" : "Failed",
        color: "text-red-400",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/30",
        icon: "x",
      };
    case "removed":
      return {
        label: "Removed",
        color: "text-slate-400",
        bgColor: "bg-slate-500/10",
        borderColor: "border-slate-500/30",
        icon: "x",
      };
    case "already_exists":
      return {
        label: "Already Exists",
        color: "text-violet-400",
        bgColor: "bg-violet-500/10",
        borderColor: "border-violet-500/30",
        icon: "check",
      };
    default:
      return {
        label: status.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase()),
        color: "text-gray-400",
        bgColor: "bg-gray-500/10",
        borderColor: "border-gray-500/30",
        icon: "unknown",
      };
  }
}
