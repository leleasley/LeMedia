import { z } from "zod";
import { registry } from "../registry";

// ============================================================================
// User Schemas
// ============================================================================

export const UserSchema = z
  .object({
    id: z.number().describe("User ID"),
    username: z.string().describe("Username"),
    email: z.string().nullable().describe("User email address"),
    groups: z.array(z.string()).describe("User groups/roles"),
    isAdmin: z.boolean().describe("Whether user is an administrator"),
  })
  .openapi("User");

export const CreateUserSchema = z
  .object({
    username: z.string().trim().min(1).describe("Username"),
    password: z.string().min(6).describe("Password (min 6 characters)"),
    email: z
      .union([z.string().trim().email(), z.literal("")])
      .optional()
      .describe("Email address"),
    groups: z.array(z.string()).optional().describe("User groups"),
    notificationEndpointIds: z
      .array(z.coerce.number().int().positive())
      .optional()
      .describe("Notification endpoint IDs to subscribe to"),
  })
  .openapi("CreateUser");

export const UpdateProfileSchema = z
  .object({
    username: z.string().trim().min(1).optional().describe("New username"),
    email: z
      .union([z.string().trim().email(), z.literal("")])
      .optional()
      .describe("New email address"),
    newPassword: z.string().min(6).optional().describe("New password"),
    currentPassword: z
      .string()
      .min(1)
      .optional()
      .describe("Current password (required when changing password)"),
    discordUserId: z
      .union([z.string().trim().regex(/^\d+$/), z.literal("")])
      .optional()
      .describe("Discord user ID for mentions"),
    discoverRegion: z.string().nullable().optional().describe("Preferred region for TMDB"),
    originalLanguage: z
      .string()
      .nullable()
      .optional()
      .describe("Preferred original language filter"),
    watchlistSyncMovies: z
      .boolean()
      .optional()
      .describe("Auto-sync movie watchlist"),
    watchlistSyncTv: z.boolean().optional().describe("Auto-sync TV watchlist"),
  })
  .openapi("UpdateProfile");

// ============================================================================
// Request Schemas
// ============================================================================

export const MovieRequestSchema = z
  .object({
    tmdbId: z.coerce.number().int().describe("TMDB movie ID"),
    qualityProfileId: z.coerce
      .number()
      .int()
      .optional()
      .describe("Radarr quality profile ID"),
  })
  .openapi("MovieRequest");

export const TvRequestSchema = z
  .object({
    tmdbId: z.coerce.number().int().describe("TMDB TV show ID"),
    seasons: z
      .array(z.number().int())
      .optional()
      .describe("Specific seasons to request"),
    qualityProfileId: z.coerce
      .number()
      .int()
      .optional()
      .describe("Sonarr quality profile ID"),
  })
  .openapi("TvRequest");

export const RequestStatusSchema = z
  .enum(["queued", "pending", "submitted", "available", "failed", "denied", "removed"])
  .describe("Request status");

export const MediaRequestSchema = z
  .object({
    id: z.string().uuid().describe("Request UUID"),
    requestType: z.enum(["movie", "episode"]).describe("Type of request"),
    tmdbId: z.number().describe("TMDB ID"),
    title: z.string().describe("Media title"),
    posterPath: z.string().nullable().describe("Poster image path"),
    backdropPath: z.string().nullable().describe("Backdrop image path"),
    status: RequestStatusSchema,
    releaseYear: z.number().nullable().describe("Release year"),
    requestedBy: z.number().describe("User ID who made the request"),
    createdAt: z.string().describe("Request creation timestamp"),
  })
  .openapi("MediaRequest");

// ============================================================================
// Media Schemas
// ============================================================================

export const MediaItemSchema = z
  .object({
    id: z.number().describe("TMDB ID"),
    mediaType: z.enum(["movie", "tv"]).describe("Media type"),
    title: z.string().nullable().describe("Title (for movies)"),
    name: z.string().nullable().describe("Name (for TV shows)"),
    posterPath: z.string().nullable().describe("Poster image path"),
    backdropPath: z.string().nullable().describe("Backdrop image path"),
    releaseDate: z.string().nullable().describe("Release date (for movies)"),
    firstAirDate: z.string().nullable().describe("First air date (for TV)"),
    voteAverage: z.number().nullable().describe("TMDB vote average"),
    voteCount: z.number().nullable().describe("TMDB vote count"),
    overview: z.string().nullable().describe("Media overview/description"),
  })
  .openapi("MediaItem");

export const SearchResultsSchema = z
  .object({
    page: z.number().describe("Current page"),
    results: z.array(MediaItemSchema).describe("Search results"),
    totalPages: z.number().describe("Total pages available"),
    totalResults: z.number().describe("Total results count"),
  })
  .openapi("SearchResults");

// ============================================================================
// Notification Schemas
// ============================================================================

export const NotificationEndpointTypeSchema = z
  .enum(["discord", "telegram", "email", "webhook", "gotify", "ntfy", "pushbullet", "pushover"])
  .describe("Notification endpoint type");

export const NotificationEndpointSchema = z
  .object({
    id: z.number().describe("Endpoint ID"),
    name: z.string().describe("Endpoint name"),
    type: NotificationEndpointTypeSchema,
    enabled: z.boolean().describe("Whether endpoint is enabled"),
    isGlobal: z.boolean().describe("Whether endpoint receives all notifications"),
  })
  .openapi("NotificationEndpoint");

// ============================================================================
// Settings Schemas
// ============================================================================

export const ServiceStatusSchema = z
  .object({
    configured: z.boolean().describe("Whether service is configured"),
    connected: z.boolean().describe("Whether service is reachable"),
    version: z.string().optional().describe("Service version"),
  })
  .openapi("ServiceStatus");

// ============================================================================
// Health Schemas
// ============================================================================

export const HealthResponseSchema = z
  .object({
    ok: z.boolean().describe("Overall health status"),
    database: z.string().describe("Database connection status"),
    apiKey: z.boolean().describe("Whether API key is configured"),
    ts: z.string().describe("Timestamp"),
  })
  .openapi("HealthResponse");

// ============================================================================
// Register all schemas with the registry
// ============================================================================

registry.register("User", UserSchema);
registry.register("CreateUser", CreateUserSchema);
registry.register("UpdateProfile", UpdateProfileSchema);
registry.register("MovieRequest", MovieRequestSchema);
registry.register("TvRequest", TvRequestSchema);
registry.register("MediaRequest", MediaRequestSchema);
registry.register("MediaItem", MediaItemSchema);
registry.register("SearchResults", SearchResultsSchema);
registry.register("NotificationEndpoint", NotificationEndpointSchema);
registry.register("ServiceStatus", ServiceStatusSchema);
registry.register("HealthResponse", HealthResponseSchema);
