# LeMedia AI Coding Instructions

## Project Overview

**LeMedia** is a Next.js 16 full-stack media request management platform (Overseerr/Jellyseerr alternative) for homelabs. It integrates deeply with Sonarr, Radarr, Jellyfin, and TMDB with PostgreSQL backend, header-based auth, and Docker deployment. The architecture emphasizes performance through aggressive caching, request deduplication, and schema-on-read patterns.

**Key Goals**: Fast discovery UX, reliable multi-service integration, user-friendly request management, flexible notifications.

---

## Architecture & Stack

### Core Framework
- **Next.js 16** App Router with standalone output (`output: "standalone"`) - SSR + client-side hydration
- **PostgreSQL 16+** with direct SQL queries (no ORM) + manual migrations
- **React 19** with server components + client hooks (SWR for fetching)
- **TypeScript** strict mode throughout

### Authentication (4-Tier System)
1. **Primary**: Header-based (Authelia/Authentik/Caddy) via `Remote-User` + `Remote-Groups`
2. **Fallback**: JWT sessions in `lemedia_session` cookie ([src/lib/session.ts](src/lib/session.ts))
3. **User Verification**: Database-backed check on every request with 60s LRU cache ([src/auth.ts](src/auth.ts))
   - Enables immediate revocation (ban, delete, permission change)
   - Users see permission changes within 60s without re-login
4. **Multi-Methods**: Password, OIDC, WebAuthn/Passkeys, Jellyfin ID
5. **Dev Bypass**: `DEV_USER` env (dev only unless `ALLOW_DEV_BYPASS=1`)

### Data Flow Architecture
```
Browser (React Components + SWR)
        ↓
  API Routes (/api/v1/*)
        ↓
  Service Layer (tmdb.ts, sonarr.ts, etc.)
        ↓
  db.ts (200+ query functions)
        ↓
  PostgreSQL
```

**State Sources** (in priority order):
1. PostgreSQL database (single source of truth for user data, requests, jobs)
2. Jellyfin availability cache (local table, updates periodically)
3. Sonarr/Radarr queues (external, polled by request-sync job)
4. Browser SWR cache (ephemeral, client-side only)

---

## Critical Knowledge

### Database Access Pattern (NEVER USE ORM)
- **All queries**: Live in [src/db.ts](src/db.ts) (4400+ lines, 200+ functions)
- **Structure**: `export async function functionName() { const p = getPool(); const res = await p.query(...); return mapped_rows; }`
- **Connection**: Single pooled instance `getPool()` from [src/db.ts](src/db.ts)
  - Pool settings: `max: 20, min: 2, idleTimeoutMillis: 30000, statement_timeout: 30000`
- **Schema Creation**: `ensureSchema()` and `ensureUserSchema()` create tables on first query (schema-on-read)
- **Key Tables**: `app_user`, `media_request`, `jellyfin_availability_cache`, `notification_endpoint`, `jobs`, `media_issue`
- **New Query Checklist**: Always check if function exists in db.ts before creating new queries

### Migrations System
- **Location**: [apps/web/migrations/](apps/web/migrations/) (numbered `.sql` files, e.g., `001_initial_schema.sql`)
- **Commands**:
  ```bash
  npm run migrate              # Apply pending migrations
  npm run migrate:status       # Check applied/pending
  npm run migrate:create <name> # Create new migration file (generates timestamp-based name)
  ```
- **Auto-run**: Migrations execute on app startup via [src/instrumentation.ts](src/instrumentation.ts)
- **Advisory Locks**: Migration runner uses PostgreSQL advisory locks to prevent concurrent execution
- **Rollback**: Not supported - only forward migrations (design decisions in migration files as comments)

### External Service Integration Patterns

**Sonarr/Radarr** ([src/lib/sonarr.ts](src/lib/sonarr.ts), [src/lib/radarr.ts](src/lib/radarr.ts)):
```typescript
// Create per-config fetcher with retry/timeout
const fetcher = await createSonarrFetcher(config);
const series = await fetcher(`/series`);
```
- Uses `baseFetch()` from [src/lib/fetch-utils.ts](src/lib/fetch-utils.ts) with exponential backoff
- Polling: `request-sync` job every 5 min updates request status in DB

**Jellyfin** ([src/lib/jellyfin.ts](src/lib/jellyfin.ts)):
- Availability cache: 10-min TTL in `jellyfin_availability_cache` table
- Cache updates: `jellyfin-availability-sync` job runs daily
- Always query cache first, never direct API calls for availability

**TMDB** ([src/lib/tmdb.ts](src/lib/tmdb.ts), [src/lib/tmdb-client.ts](src/lib/tmdb-client.ts)):
- Client: [src/lib/tmdb-client.ts](src/lib/tmdb-client.ts) handles authentication + rate limiting
- Aggregate data: [src/lib/media-aggregate.ts](src/lib/media-aggregate.ts) builds enriched responses

**All External APIs**: Wrap expensive calls with `deduplicateFetch()` from [src/lib/request-cache.ts](src/lib/request-cache.ts)
  - Prevents duplicate parallel requests for same resource

### Caching Strategy (3-Tier)
1. **Request Deduplication** ([src/lib/request-cache.ts](src/lib/request-cache.ts)): Merges parallel API calls to same endpoint
2. **In-Memory LRU** ([src/lib/local-cache.ts](src/lib/local-cache.ts)): 500 entries max, TTL-based (use `withCache()` helper)
3. **Database** (Jellyfin cache): Persistent across restarts
4. **Browser SWR**: Client-side cache with `revalidateOnFocus: false` for user-specific data

### Notification System ([src/notifications/](src/notifications/))
- **Channels**: Discord, Email (SMTP), Telegram, Webhooks, Web Push (PWA)
- **Storage**: `notification_endpoint` table (global config) + `user_notification_endpoint` junction (per-user subscriptions)
- **Event-Driven**: Handlers dispatch notifications on request status changes, issues reported, etc.
- **Enforcement**: `REQUESTS_REQUIRE_NOTIFICATIONS=true` forces at least one endpoint before requesting media

### Background Jobs System ([src/lib/jobs/](src/lib/jobs/))
- **Scheduler**: DB-backed cron runner with PostgreSQL advisory locks in [src/lib/jobs/index.ts](src/lib/jobs/index.ts)
- **Definitions**: [src/lib/jobs/definitions.ts](src/lib/jobs/definitions.ts) lists all job handlers
- **Job Types**:
  - `request-sync` (5 min): Poll Sonarr/Radarr, update `media_request` status
  - `watchlist-sync` (daily): Convert Jellyfin watchlists to auto-requests
  - `weekly-digest` (weekly): Email summary of new content
  - `session-cleanup` (daily): Purge expired sessions
  - `calendar-notifications` (hourly): Send reminders for iCal subscriptions
  - `jellyfin-availability-sync` (daily): Batch refresh availability cache

---

## Development Workflow

### Quick Start Local Dev
```bash
# From workspace root (/opt/LeMedia)
docker compose up -d --build lemedia-web     # Full rebuild (code/deps changed)
docker compose logs -f lemedia-web            # Stream logs
docker compose ps                             # Check status

# Shell into container
docker compose exec lemedia-web sh
```

### Iteration Optimization
- **Config-only changes** (`.env` edits): `docker compose restart lemedia-web` (60sec)
- **Code/deps changes**: `docker compose up -d --build lemedia-web` (2-3min)
- **After code changes**: Always hard-refresh browser (Ctrl+Shift+R) to clear SW cache

### Database Operations
```bash
# Apply migrations
npm --workspace apps/web run migrate

# Create new migration
npm --workspace apps/web run migrate:create add_feature_table

# Direct psql access
docker compose exec lemedia-db psql -U lemedia -d lemedia
```

### Key Entry Points
- [src/db.ts](src/db.ts) - All data access (start here for queries)
- [src/auth.ts](src/auth.ts) - Authentication checks every request
- [src/lib/jobs/](src/lib/jobs/) - Background tasks
- [agents.MD](agents.MD) - Recent changes and troubleshooting
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Full architecture deep-dive

---

## Project-Specific Patterns

### API Response Format (All Routes)
```typescript
// Success
NextResponse.json({ field: value, ... })

// Error (all error routes)
NextResponse.json({ error: "Human-readable message" }, { status: statusCode })

// Streaming (SSE)
// Must be listed in public/sw.js to bypass ServiceWorker
const encoder = new TextEncoder();
const stream = new ReadableStream({ start: controller => { ... } });
return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
```

### User Mutations Always Invalidate Cache
```typescript
// After updating user data:
cacheManager.invalidateUserData(userId)
// Or during auth: 
withCache(...) automatically refreshes on next auth check
```

### Image Proxying (CSP Compliance)
- All external images (TMDB, Jellyfin) via `/imageproxy/`
- Prevents CSP violations, centralizes proxy logic
- Route handler: [apps/web/app/imageproxy/route.ts](apps/web/app/imageproxy/route.ts)

### Rate Limiting
- Use `setRateLimit()` from [src/lib/rate-limit.ts](src/lib/rate-limit.ts) for login/sensitive endpoints
- Prevents brute force attacks with sliding window counters

### Error Handling in Route Handlers
```typescript
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;  // Auth error
  
  try {
    // operation
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[CONTEXT]", e);
    return NextResponse.json({ error: "Failed to ..." }, { status: 500 });
  }
}
```

---

## Conventions & Patterns

### File Organization
- **Route Pages**: `app/(app)/**` (auth'd), `app/(admin)/**` (admin only), `app/(public)/**` unauth'd
- **API Routes**: `app/api/v1/**` (numbered for versioning)
- **Components**: `src/components/*/Component.tsx` (PascalCase)
- **Hooks**: `src/hooks/useHook.ts` (camelCase prefix `use`)
- **Services**: `src/lib/service.ts` (camelCase, one concern per file)
- **Database**: All imports from `@/db` (single source)

### Naming Conventions
- **Components**: PascalCase (`Button`, `Modal`, `UserCard`)
- **Functions**: camelCase, prefix with action verb (`getUser`, `createRequest`, `syncAvailability`)
- **Database functions**: descriptive, grouped by entity (`getUserWithHash`, `listUsers`, `updateUser`, `deleteUser`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_CACHE_TTL`, `SESSION_TIMEOUT`)
- **Boolean vars**: `is`/`has` prefix (`isLoading`, `hasPermission`, `isAdmin`)

### Type Definitions
- Define near usage in same file when simple
- Share types in [src/types/](src/types/) for cross-file reuse
- Avoid creating types for one-off responses (inline)

### Logging
- Use `console.log("[CONTEXT]", message)` for debug info
- Use `console.error("[CONTEXT]", error)` for errors
- Never log sensitive data (passwords, tokens)
- Set `AUTH_DEBUG=1` env for verbose auth flow logging

### Server vs. Client Code
- Prefix server files with `"use server";` or `import "server-only"`
- Client components: `"use client"` directive
- DB access: Server-only (never expose pool connection to client)

---

## Critical Pitfalls & Fixes

1. **ServiceWorker Caching SSE**: `/api/v1/stream/*` paths must be listed in [public/sw.js](public/sw.js)
   - SSE streams cannot be cached by ServiceWorker; users get "unexpected error"
   - **Fix**: Add route to SW bypass list + instruct users to hard-refresh (Ctrl+Shift+R)

2. **Build-Time Database URL**: `DATABASE_URL` must be passed as Docker build ARG in [apps/web/Dockerfile](apps/web/Dockerfile)
   - If missing, Next.js build fails without clear error
   - **Fix**: Ensure ARG in Dockerfile matches environment

3. **Session Verification**: `getUser()` throws if session invalid/expired
   - **Pattern**: Always call `requireUser()` which catches error and returns 401
   
4. **Jellyfin Cache Stale**: Never call Jellyfin API directly for availability
   - **Fix**: Query `jellyfin_availability_cache` table + rely on job to refresh

5. **Pool Exhaustion**: If `db.ts` queries block or hang
   - **Check**: `statement_timeout: 30000` in pool config
   - **Check**: No infinite loops holding connections
   - **Check**: All queries properly await and release connections

---

## Testing & Debugging

- **Health endpoint**: `http://localhost:3010/api/health` (Docker healthcheck)
- **Auth debug**: `AUTH_DEBUG=1` env var logs session verification
- **Database shell**: `docker compose exec lemedia-db psql -U lemedia -d lemedia`
- **Raw logs**: `docker compose logs -f lemedia-web --tail=100`
- **No automated tests**: Project relies on manual testing + Docker healthchecks

---

## Environment Variables

### Build-Required
- `DATABASE_URL` - PostgreSQL connection, e.g., `postgres://user:pass@host/db`
- `SESSION_SECRET` - JWT key (32+ random chars)
- `SERVICES_SECRET_KEY` - Encrypt service credentials
- `TMDB_API_KEY` - The Movie Database API key

### Service Integration
- `SONARR_URL`, `SONARR_API_KEY` - TV download
- `RADARR_URL`, `RADARR_API_KEY` - Movie download

### Optional
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` - Web Push (generate via `node apps/web/generate-vapid-keys.js`)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` - Email notifications

### Feature Flags
- `REQUESTS_REQUIRE_NOTIFICATIONS` - Force users to configure notifications
- `AUTH_DEBUG` - Log authentication flows
- `DEV_USER`, `DEV_GROUPS` - Dev bypass (dev mode only)

See [.env.example](.env.example) for all options.

---

## Git Workflow & Recent Changes

See [agents.MD](agents.MD) for:
- Quick command reference
- Recent bug fixes and features
- Development best practices
- Commit message conventions
