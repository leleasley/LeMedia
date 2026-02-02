import { z } from "zod";
import { registerRoute, ErrorResponseSchema } from "../registry";
import {
  UserSchema,
  UpdateProfileSchema,
  CreateUserSchema,
  MovieRequestSchema,
  TvRequestSchema,
  MediaRequestSchema,
  MediaItemSchema,
  SearchResultsSchema,
  NotificationEndpointSchema,
  HealthResponseSchema,
} from "../schemas";

// ============================================================================
// Health Endpoints
// ============================================================================

registerRoute({
  method: "get",
  path: "/health",
  summary: "Health check",
  description: "Check the health status of the API and its dependencies",
  tags: ["Health"],
  responses: {
    "200": {
      description: "Service is healthy",
      schema: HealthResponseSchema,
    },
    "503": {
      description: "Service is unhealthy",
      schema: HealthResponseSchema,
    },
  },
});

// ============================================================================
// Profile Endpoints
// ============================================================================

registerRoute({
  method: "get",
  path: "/v1/profile",
  summary: "Get current user profile",
  description: "Retrieve the profile of the currently authenticated user",
  tags: ["Profile"],
  security: true,
  responses: {
    "200": {
      description: "User profile",
      schema: z.object({ user: UserSchema }),
    },
    "401": {
      description: "Unauthorized",
      schema: ErrorResponseSchema,
    },
  },
});

registerRoute({
  method: "patch",
  path: "/v1/profile",
  summary: "Update current user profile",
  description: "Update profile settings for the currently authenticated user",
  tags: ["Profile"],
  security: true,
  request: {
    body: UpdateProfileSchema,
  },
  responses: {
    "200": {
      description: "Profile updated successfully",
      schema: z.object({
        user: UserSchema.partial(),
        requireLogout: z.boolean().describe("Whether user should re-login"),
      }),
    },
    "400": {
      description: "Validation error",
      schema: ErrorResponseSchema,
    },
    "401": {
      description: "Unauthorized",
      schema: ErrorResponseSchema,
    },
  },
});

// ============================================================================
// User Management Endpoints (Admin)
// ============================================================================

registerRoute({
  method: "get",
  path: "/v1/users",
  summary: "List all users",
  description: "Retrieve a list of all users (admin only)",
  tags: ["Users", "Admin"],
  security: true,
  responses: {
    "200": {
      description: "List of users",
      schema: z.object({ users: z.array(UserSchema) }),
    },
    "401": {
      description: "Unauthorized",
      schema: ErrorResponseSchema,
    },
    "403": {
      description: "Forbidden - Admin required",
      schema: ErrorResponseSchema,
    },
  },
});

registerRoute({
  method: "post",
  path: "/v1/users",
  summary: "Create a new user",
  description: "Create a new user account (admin only)",
  tags: ["Users", "Admin"],
  security: true,
  request: {
    body: CreateUserSchema,
  },
  responses: {
    "200": {
      description: "User created successfully",
      schema: z.object({ user: UserSchema }),
    },
    "400": {
      description: "Validation error or user already exists",
      schema: ErrorResponseSchema,
    },
    "403": {
      description: "Forbidden - Admin required",
      schema: ErrorResponseSchema,
    },
  },
});

registerRoute({
  method: "get",
  path: "/v1/users/{id}",
  summary: "Get user by ID",
  description: "Retrieve a specific user by their ID (admin only)",
  tags: ["Users", "Admin"],
  security: true,
  request: {
    params: z.object({
      id: z.coerce.number().int().positive().describe("User ID"),
    }),
  },
  responses: {
    "200": {
      description: "User details",
      schema: z.object({ user: UserSchema }),
    },
    "404": {
      description: "User not found",
      schema: ErrorResponseSchema,
    },
  },
});

// ============================================================================
// Request Endpoints
// ============================================================================

registerRoute({
  method: "post",
  path: "/v1/request/movie",
  summary: "Request a movie",
  description: "Submit a request for a movie to be added to the library",
  tags: ["Requests"],
  security: true,
  request: {
    body: MovieRequestSchema,
  },
  responses: {
    "200": {
      description: "Request submitted successfully",
      schema: z.object({
        ok: z.boolean(),
        requestId: z.string().uuid().optional(),
        pending: z.boolean().optional().describe("Whether request requires approval"),
        radarrMovieId: z.number().nullable().optional(),
      }),
    },
    "400": {
      description: "Validation error",
      schema: ErrorResponseSchema,
    },
    "403": {
      description: "Forbidden or notifications not configured",
      schema: ErrorResponseSchema,
    },
    "409": {
      description: "Movie already requested",
      schema: ErrorResponseSchema,
    },
  },
});

registerRoute({
  method: "post",
  path: "/v1/request/tv",
  summary: "Request a TV show",
  description: "Submit a request for a TV show or specific seasons",
  tags: ["Requests"],
  security: true,
  request: {
    body: TvRequestSchema,
  },
  responses: {
    "200": {
      description: "Request submitted successfully",
      schema: z.object({
        ok: z.boolean(),
        requestId: z.string().uuid().optional(),
        pending: z.boolean().optional(),
        sonarrSeriesId: z.number().nullable().optional(),
      }),
    },
    "400": {
      description: "Validation error",
      schema: ErrorResponseSchema,
    },
    "403": {
      description: "Forbidden",
      schema: ErrorResponseSchema,
    },
  },
});

registerRoute({
  method: "get",
  path: "/v1/requests",
  summary: "List requests",
  description: "Get a paginated list of media requests",
  tags: ["Requests"],
  security: true,
  request: {
    query: z.object({
      page: z.coerce.number().int().positive().optional().describe("Page number"),
      limit: z.coerce.number().int().min(1).max(100).optional().describe("Items per page"),
      status: z.string().optional().describe("Filter by status"),
    }),
  },
  responses: {
    "200": {
      description: "List of requests",
      schema: z.object({
        requests: z.array(MediaRequestSchema),
        page: z.number(),
        totalPages: z.number(),
        totalResults: z.number(),
      }),
    },
    "401": {
      description: "Unauthorized",
      schema: ErrorResponseSchema,
    },
  },
});

registerRoute({
  method: "get",
  path: "/v1/requests/me",
  summary: "Get my requests",
  description: "Get requests submitted by the current user",
  tags: ["Requests"],
  security: true,
  responses: {
    "200": {
      description: "User's requests",
      schema: z.object({
        requests: z.array(MediaRequestSchema),
      }),
    },
    "401": {
      description: "Unauthorized",
      schema: ErrorResponseSchema,
    },
  },
});

// ============================================================================
// Search & Discovery Endpoints
// ============================================================================

registerRoute({
  method: "get",
  path: "/v1/tmdb/search",
  summary: "Search for media",
  description: "Search for movies, TV shows, and people on TMDB",
  tags: ["Search", "TMDB"],
  security: true,
  request: {
    query: z.object({
      q: z.string().min(1).max(100).describe("Search query"),
      page: z.coerce.number().int().positive().max(500).optional().describe("Page number"),
      type: z
        .enum(["all", "movie", "tv", "person"])
        .optional()
        .describe("Filter by media type"),
    }),
  },
  responses: {
    "200": {
      description: "Search results",
      schema: SearchResultsSchema,
    },
    "400": {
      description: "Invalid query",
      schema: ErrorResponseSchema,
    },
  },
});

registerRoute({
  method: "get",
  path: "/v1/tmdb/trending",
  summary: "Get trending media",
  description: "Get trending movies and TV shows",
  tags: ["TMDB"],
  security: true,
  request: {
    query: z.object({
      type: z.enum(["all", "movie", "tv"]).optional().describe("Media type"),
      timeWindow: z.enum(["day", "week"]).optional().describe("Time window"),
    }),
  },
  responses: {
    "200": {
      description: "Trending media",
      schema: SearchResultsSchema,
    },
  },
});

// ============================================================================
// Media Detail Endpoints
// ============================================================================

registerRoute({
  method: "get",
  path: "/v1/movie/{id}",
  summary: "Get movie details",
  description: "Get detailed information about a movie",
  tags: ["Media", "TMDB"],
  security: true,
  request: {
    params: z.object({
      id: z.coerce.number().int().positive().describe("TMDB movie ID"),
    }),
  },
  responses: {
    "200": {
      description: "Movie details",
      schema: MediaItemSchema.extend({
        runtime: z.number().nullable().describe("Runtime in minutes"),
        genres: z.array(z.object({ id: z.number(), name: z.string() })),
        productionCompanies: z.array(z.object({ id: z.number(), name: z.string() })),
        status: z.string().describe("Movie status"),
        budget: z.number().describe("Budget in USD"),
        revenue: z.number().describe("Revenue in USD"),
      }),
    },
    "404": {
      description: "Movie not found",
      schema: ErrorResponseSchema,
    },
  },
});

registerRoute({
  method: "get",
  path: "/v1/tv/{id}",
  summary: "Get TV show details",
  description: "Get detailed information about a TV show",
  tags: ["Media", "TMDB"],
  security: true,
  request: {
    params: z.object({
      id: z.coerce.number().int().positive().describe("TMDB TV show ID"),
    }),
  },
  responses: {
    "200": {
      description: "TV show details",
      schema: MediaItemSchema.extend({
        numberOfSeasons: z.number().describe("Number of seasons"),
        numberOfEpisodes: z.number().describe("Total episodes"),
        genres: z.array(z.object({ id: z.number(), name: z.string() })),
        networks: z.array(z.object({ id: z.number(), name: z.string() })),
        status: z.string().describe("Show status"),
        episodeRunTime: z.array(z.number()).describe("Episode runtimes"),
      }),
    },
    "404": {
      description: "TV show not found",
      schema: ErrorResponseSchema,
    },
  },
});

// ============================================================================
// Notification Endpoints
// ============================================================================

registerRoute({
  method: "get",
  path: "/v1/notification-endpoints",
  summary: "List notification endpoints",
  description: "Get all configured notification endpoints (admin only)",
  tags: ["Notifications", "Admin"],
  security: true,
  responses: {
    "200": {
      description: "List of notification endpoints",
      schema: z.object({
        endpoints: z.array(NotificationEndpointSchema),
      }),
    },
    "403": {
      description: "Forbidden - Admin required",
      schema: ErrorResponseSchema,
    },
  },
});

registerRoute({
  method: "post",
  path: "/v1/notification-endpoints",
  summary: "Create notification endpoint",
  description: "Create a new notification endpoint (admin only)",
  tags: ["Notifications", "Admin"],
  security: true,
  request: {
    body: z.object({
      name: z.string().min(1).describe("Endpoint name"),
      type: z.enum(["discord", "telegram", "email", "webhook"]).describe("Endpoint type"),
      enabled: z.boolean().optional().describe("Whether enabled"),
      isGlobal: z.boolean().optional().describe("Whether global"),
      // Type-specific fields handled by discriminated union in actual implementation
    }),
  },
  responses: {
    "201": {
      description: "Endpoint created",
      schema: z.object({ endpoint: NotificationEndpointSchema }),
    },
    "400": {
      description: "Validation error",
      schema: ErrorResponseSchema,
    },
  },
});

// ============================================================================
// Availability Endpoints
// ============================================================================

registerRoute({
  method: "get",
  path: "/v1/availability/movie/{id}",
  summary: "Check movie availability",
  description: "Check if a movie is available in the library",
  tags: ["Media"],
  security: true,
  request: {
    params: z.object({
      id: z.coerce.number().int().positive().describe("TMDB movie ID"),
    }),
  },
  responses: {
    "200": {
      description: "Availability status",
      schema: z.object({
        available: z.boolean().describe("Whether movie is in library"),
        jellyfinItemId: z.string().nullable().optional().describe("Jellyfin item ID"),
      }),
    },
  },
});

registerRoute({
  method: "get",
  path: "/v1/availability/tv/{id}",
  summary: "Check TV show availability",
  description: "Check if a TV show is available in the library",
  tags: ["Media"],
  security: true,
  request: {
    params: z.object({
      id: z.coerce.number().int().positive().describe("TMDB TV show ID"),
    }),
  },
  responses: {
    "200": {
      description: "Availability status",
      schema: z.object({
        available: z.boolean().describe("Whether show is in library"),
        partiallyAvailable: z.boolean().optional().describe("Whether some episodes available"),
        jellyfinItemId: z.string().nullable().optional().describe("Jellyfin item ID"),
      }),
    },
  },
});
