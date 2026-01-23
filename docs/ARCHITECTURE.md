# Architecture

**Analysis Date:** 2026-01-23

## Pattern Overview

**Overall:** Next.js 16 full-stack application with client-server separation, event-driven background job system, and multi-service integration pattern.

**Key Characteristics:**
- Next.js App Router with server components and client components
- PostgreSQL database as single source of truth with connection pooling
- Background job scheduler with cron support and database locking
- Header-based authentication via reverse proxy (Authelia/Authentik/Caddy)
- SSR and client-side rendering hybrid approach using SWR for data fetching

## Layers

**Presentation Layer (Client):**
- Purpose: React components rendered in browser, interactive UI
- Location: `/opt/LeMedia/apps/web/src/components/`, `/opt/LeMedia/apps/web/app/(app)/`
- Contains: Page components, layout components, UI components (Radix/Tailwind), hooks
- Depends on: API routes, SWR for data fetching, next-themes, react-intl
- Used by: Browser clients

**API Layer (Route Handlers):**
- Purpose: RESTful endpoints for client-server communication
- Location: `/opt/LeMedia/apps/web/app/api/`, `/opt/LeMedia/apps/web/app/api/v1/`
- Contains: 366 route files handling requests/TV/movies/admin/settings/auth
- Depends on: Database layer (`@/db`), external service libraries (`@/lib/*`), authentication (`@/auth`)
- Used by: Frontend SWR calls, external webhooks

**Service Layer (Business Logic):**
- Purpose: Integration with external services (Sonarr, Radarr, TMDB, Jellyfin) and complex operations
- Location: `/opt/LeMedia/apps/web/src/lib/`
- Contains: 70+ service modules including:
  - `tmdb.ts` (13KB): Movie/TV metadata from The Movie Database
  - `sonarr.ts` (12KB): TV show monitoring and downloading
  - `radarr.ts` (9KB): Movie monitoring and downloading
  - `jellyfin.ts` (30KB): Media library integration
  - `request-sync.ts` (12KB): Synchronize request status with Sonarr/Radarr
  - `media-status.ts` (9KB): Status calculations for media items
  - `jellyfin-availability-sync.ts` (10KB): Cache Jellyfin library state
- Depends on: Database layer, HTTP clients (axios), encryption
- Used by: API routes, job scheduler, background tasks

**Data Access Layer (Database):**
- Purpose: All database queries and schema interactions
- Location: `/opt/LeMedia/apps/web/src/db.ts` (146KB single file)
- Contains: 200+ exported functions for users, requests, settings, jobs, notifications, etc.
- Depends on: PostgreSQL via `pg` package, connection pooling
- Used by: API routes, service layer, job scheduler

**Background Job System:**
- Purpose: Scheduled and asynchronous tasks
- Location: `/opt/LeMedia/apps/web/src/lib/jobs/`
- Contains: Job scheduler (`index.ts`), job handlers (`definitions.ts`)
- Job Types: request-sync, watchlist-sync, weekly-digest, session-cleanup, calendar-notifications, jellyfin-availability-sync
- Scheduling: Cron-based with PostgreSQL advisory locks for distributed consistency
- Depends on: Database layer, service layer, cron-parser

**Presentation Infrastructure:**
- Purpose: Provider components for global state and utilities
- Location: `/opt/LeMedia/apps/web/src/components/Providers/`
- Contains: `IntlProviderWrapper` (i18n), `SWRProvider` (data fetching), `ToastProvider` (notifications)

## Data Flow

**Request Lifecycle (User Makes Media Request):**

1. User submits request form in browser (Movie/TV detail page)
2. Client component calls API route `/api/v1/request/*/create`
3. Route handler:
   - Validates user authentication via `getUser()`
   - Checks request limit/approval status
   - Inserts `media_request` record in PostgreSQL
   - Calls Sonarr/Radarr service to add item to queue
   - Returns request ID to client
4. Client receives confirmation and updates UI
5. Background job `request-sync` (every 5 min):
   - Queries Sonarr/Radarr API for status updates
   - Updates `media_request.status` in database
   - Sends notifications to user via email/Discord/Slack
6. User sees live status updates via SWR polling

**Media Discovery Lifecycle:**

1. User navigates to Discover page or searches
2. Client calls `/api/v1/tmdb/search` or `/api/v1/tmdb/[type]/[id]`
3. Route handler queries TMDB API and returns metadata
4. Client renders title card with availability info
5. Availability check calls `/api/v1/availability`:
   - Checks local Jellyfin cache in `jellyfin_availability` table
   - Checks Sonarr/Radarr for queued requests
   - Returns aggregated status (available, pending, missing)
6. User can click to request missing episodes

**Background Sync Lifecycle (Jellyfin):**

1. Admin configures Jellyfin in settings
2. Job `jellyfin-availability-sync` triggers on schedule (or manually)
3. Job:
   - Queries Jellyfin API for media items
   - Upserts records into `jellyfin_availability` table with episode metadata
   - Updates `jellyfin_scan_history` for audit trail
4. Cache expires after configured TTL
5. Next availability check uses fresh cache instead of live API call

**State Management:**

- **Server State**: PostgreSQL database (source of truth)
- **Client State**: React component state + SWR cache
- **Cache Layers**:
  - Local in-memory: `@/lib/local-cache.ts` (1-minute TTL for admin counts)
  - HTTP: Browser cache headers in `next.config.mjs`
  - Database: Jellyfin availability cache table
- **Session State**: JWT tokens stored in HTTP-only cookies, validated server-side

## Key Abstractions

**Request Entity:**
- Purpose: Represents user request for media
- Examples: `media_request` table columns: id, user_id, media_type, tmdb_id, status, created_at, etc.
- Pattern: Entity stored in DB with status machine (queued → pending → submitted → available/failed)

**Media Availability:**
- Purpose: Determine if media exists in any system (Jellyfin, Sonarr, Radarr, pending)
- Examples: `src/lib/library-availability.ts`, `src/lib/media-status.ts`, `src/lib/availability-client.ts`
- Pattern: Check multiple sources with fallback order: Jellyfin cache → Sonarr/Radarr → cached results

**Service Configuration:**
- Purpose: Store encrypted credentials for external services
- Examples: Sonarr API key, Radarr API key, TMDB API key, Jellyfin URL
- Pattern: Stored encrypted in database `service_settings` table, decrypted on demand via `@/lib/encryption.ts`

**Notification Events:**
- Purpose: Trigger notifications on state changes
- Examples: Request approved, request available, new episodes aired
- Pattern: Event dispatchers in `/opt/LeMedia/apps/web/src/notifications/` (request-events.ts, issue-events.ts, etc.)

## Entry Points

**Web Application:**
- Location: `/opt/LeMedia/apps/web/app/layout.tsx`
- Triggers: Browser navigation to any app path
- Responsibilities: Initialize theme, providers, toast system, PWA support, fetch user profile

**Authenticated App Layout:**
- Location: `/opt/LeMedia/apps/web/app/(app)/layout.tsx`
- Triggers: User navigates to `/` or any app route
- Responsibilities: Verify authentication, fetch user profile, fetch admin stats, fetch maintenance state

**API Routes:**
- Location: `/opt/LeMedia/apps/web/app/api/v1/*` (366 endpoints)
- Triggers: Client SWR calls, external webhooks
- Responsibilities: Validate auth, process business logic, return JSON

**Job Scheduler:**
- Location: `/opt/LeMedia/apps/web/src/lib/jobs/index.ts`
- Triggers: Application startup (called from `/opt/LeMedia/apps/web/app/(app)/layout.tsx`)
- Responsibilities: Start interval loop, execute due jobs via handlers, record results

**Middleware:**
- Location: Not explicitly implemented; Next.js default middleware
- Triggers: Every request through app
- Responsibilities: Authentication validation happens per-route via `requireUser()` and `requireAdmin()`

## Error Handling

**Strategy:** Try-catch at route level with normalized error responses. Database errors logged but user gets generic messages.

**Patterns:**

- **Route-level catch**: Wrap `getUser()` and database calls in try-catch, return 401/403/500 JSON
- **Authentication errors**: Return `NextResponse.json({ error: "Unauthorized" }, { status: 401 })`
- **Authorization errors**: Return `NextResponse.json({ error: "Forbidden" }, { status: 403 })`
- **Service failures**: Log error, return 500 with generic message, don't expose internal error details
- **Validation errors**: Use Zod schemas, return 400 with validation errors
- **Database connection**: Pool configured with timeouts; errors logged via `logger.error()`, request fails gracefully

## Cross-Cutting Concerns

**Logging:**
- Tool: Console-based (no external service)
- Pattern: `logger.info()`, `logger.warn()`, `logger.error()` imported from `@/lib/logger.ts`
- Usage: Debug info in job scheduler, database errors, authentication issues

**Validation:**
- Tool: Zod schemas
- Pattern: Define shape with `z.object()`, parse user input before use
- Examples: `DatabaseUrlSchema` in `db.ts`, environment validation in `env-validation.ts`

**Authentication:**
- Tool: JWT in HTTP-only cookies
- Pattern: `getUser()` from `@/auth.ts` extracts session from cookie, verifies JWT, checks DB, returns AppUser type
- Caching: User info cached for 1 minute per `@/lib/local-cache.ts`
- Groups: User groups stored in database, mapped to admin role

**Encryption:**
- Tool: Built-in Node.js crypto
- Pattern: `encryptSecret()` and `decryptSecret()` from `@/lib/encryption.ts` for storing service credentials
- Key: Derived from `SERVICES_SECRET_KEY` environment variable

**Rate Limiting:**
- Tool: `axios-rate-limit` package
- Pattern: Applied to external API calls (Sonarr, Radarr, TMDB)
- Examples: `src/lib/rate-limit.ts` implements sliding window limits

**Caching:**
- Multi-layered approach:
  - Local in-memory (30-60 second TTL): Admin counts via `withCache()` from `@/lib/local-cache.ts`
  - HTTP browser cache: Static assets cached 1 year
  - Database: Jellyfin availability cached in table
  - Request deduplication: SWR on frontend handles duplicate requests

---

*Architecture analysis: 2026-01-23*
