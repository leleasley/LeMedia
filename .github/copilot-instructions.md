# LeMedia AI Coding Instructions

## Project Overview
LeMedia is a Next.js 16 media request management platform (Overseerr/Jellyseerr alternative) with header-based auth, PostgreSQL, Docker deployment, and deep integration with Sonarr, Radarr, Jellyfin, and TMDB. Architecture focuses on performance via aggressive caching, deduplication, and Docker standalone builds.

## Architecture & Stack

- **Framework**: Next.js 16 App Router with standalone output (`output: "standalone"`)
- **Database**: PostgreSQL with manual migration system (not ORM)
- **Auth**: Header-based (Authelia/Authentik) + JWT sessions + password/OIDC/passkey fallbacks
- **Deployment**: Docker Compose with multi-stage builds (deps → build → run)
- **Caching**: Three-tier strategy:
  1. `local-cache.ts` - In-memory LRU (500 entries max, TTL-based)
  2. `request-cache.ts` - Request deduplication (prevents parallel duplicate API calls)
  3. `cache-manager.ts` - Global cache coordination
- **State**: Server-side rendered pages + SWR for client-side fetching

## Critical Patterns

### Database Access
- **Direct SQL**: All queries in [src/db.ts](src/db.ts) (4400+ lines) - no ORM
- **Pool Management**: Single `getPool()` exported from [src/db.ts](src/db.ts) with optimized settings:
  ```typescript
  max: 20, min: 2, idleTimeoutMillis: 30000, statement_timeout: 30000
  ```
- **Migrations**: Manual SQL files in [db/](db/) applied via [src/lib/migrations.ts](src/lib/migrations.ts)
  - Run: `npm run migrate` (workspace root or container)
  - Create: `npm run migrate:create <name>`
  - Migrations auto-run on app startup via [src/instrumentation.ts](src/instrumentation.ts)

### Authentication Flow
1. Header-based primary: `Remote-User` + `Remote-Groups` from reverse proxy
2. Session fallback: JWT in `lemedia_session` cookie (see [src/lib/session.ts](src/lib/session.ts))
3. User verification: Database-backed with 60s LRU cache ([src/auth.ts](src/auth.ts)#L56-62)
   - Enables immediate session revocation on ban/delete/permission change
4. Dev bypass: `DEV_USER` env (only in dev mode unless `ALLOW_DEV_BYPASS=1`)

### External Service Integration
- **Sonarr/Radarr**: Create fetchers via `createSonarrFetcher()` / `createRadarrFetcher()` in [src/lib/sonarr.ts](src/lib/sonarr.ts) and [src/lib/radarr.ts](src/lib/radarr.ts)
  - All calls use `baseFetch()` from [src/lib/fetch-utils.ts](src/lib/fetch-utils.ts) for retry/timeout logic
- **Jellyfin**: Availability checks cached 10min ([src/lib/jellyfin.ts](src/lib/jellyfin.ts))
- **TMDB**: Base client in [src/lib/tmdb-client.ts](src/lib/tmdb-client.ts), helpers in [src/lib/tmdb.ts](src/lib/tmdb.ts)
  - Aggregate data (ratings, keywords, providers) via [src/lib/media-aggregate.ts](src/lib/media-aggregate.ts)

### Notification System
- Multi-channel: Discord, Email, Telegram, Webhooks, Web Push (PWA)
- Event-driven: See [src/notifications/](src/notifications/) for handlers
- Require user enrollment: `REQUESTS_REQUIRE_NOTIFICATIONS=true` forces users to configure at least one endpoint before requesting media

### Jobs System
- Cron-based: Defined in [src/lib/jobs/definitions.ts](src/lib/jobs/definitions.ts)
- Handlers: `jobHandlers` in [src/lib/jobs/definitions.ts](src/lib/jobs/definitions.ts)
  - `request-sync`: Poll Sonarr/Radarr for download status
  - `watchlist-sync`: Convert Jellyfin watchlists to requests
  - `weekly-digest`: Email summary of new content
  - `session-cleanup`: Purge expired sessions
  - `calendar-notifications`: iCal subscription reminders
  - `jellyfin-availability-sync`: Batch availability cache updates

## Development Workflow

### Local Development
```bash
# From workspace root (/opt/LeMedia)
docker compose up -d --build lemedia-web  # Full rebuild after code/deps change
docker compose up -d                      # Restart without rebuild (config-only changes)
docker compose logs -f lemedia-web        # Stream logs
docker compose exec lemedia-web sh        # Shell into container
```

### Faster Iteration
- **Config changes only** (`.env` edits): `docker compose restart lemedia-web` (no rebuild)
- **Code/dependency changes**: `docker compose up -d --build lemedia-web`

### Database Migrations
```bash
# Inside container or from host (if DATABASE_URL points to localhost)
npm --workspace apps/web run migrate              # Apply pending
npm --workspace apps/web run migrate:status       # List applied/pending
npm --workspace apps/web run migrate:create <name> # Create new migration
```

### Key Files to Check First
- [src/db.ts](src/db.ts) - All database queries and schemas
- [src/auth.ts](src/auth.ts) - Authentication logic
- [agents.MD](agents.MD) - Quick command reference and recent changes
- [README.md](README.md) - Feature list and deployment guide

## Common Pitfalls

1. **Service Worker caching SSE**: `/api/v1/stream/*` must bypass SW (see [public/sw.js](public/sw.js))
   - Users need hard refresh (Ctrl+Shift+R) after SW changes
2. **Build ARGs**: `DATABASE_URL`, `SESSION_SECRET`, etc. must be passed as `ARG` in [apps/web/Dockerfile](apps/web/Dockerfile) for build-time Next.js config
3. **Cache invalidation**: Use `cacheManager.invalidateUserData()` after user mutations
4. **Image proxy**: All external images (TMDB, Jellyfin) should use `/imageproxy/` to avoid CSP violations
5. **Rate limiting**: Use [src/lib/rate-limit.ts](src/lib/rate-limit.ts) helpers for login/API endpoints
6. **Request deduplication**: Wrap expensive external API calls with `deduplicateFetch()` from [src/lib/request-cache.ts](src/lib/request-cache.ts)

## Testing & Debugging

- **Auth debug**: Set `AUTH_DEBUG=1` to log session verification
- **Logs**: Structured logging via [src/lib/logger.ts](src/lib/logger.ts)
  - Use `logger.info()`, `logger.error()`, etc. instead of `console.log`
- **Health check**: `http://localhost:3010/api/health` (used by Docker healthcheck)
- **Database**: Direct psql access: `docker compose exec lemedia-db psql -U lemedia -d lemedia`

## Conventions

- **File structure**: Next.js App Router with route groups:
  - `app/(app)/` - Authenticated app pages
  - `app/(admin)/` - Admin-only pages
  - `app/(public)/` - Public pages (shares, unsubscribe)
  - `app/api/` - API routes
- **Imports**: Use `@/` alias for [src/](src/) directory
- **Server-only code**: Prefix with `import "server-only";` when using DB or secrets
- **Error handling**: Return `NextResponse.json({ error: "..." })` for API routes
- **Types**: Define inline or in [src/types/](src/types/) (avoid excessive abstraction)

## Git Workflow (See agents.MD)

1. Make changes with AI assistance
2. Test: `docker compose up -d --build lemedia-web`
3. Commit:
   ```bash
   git add .
   git commit -m "Brief description

   - Bullet points
   - Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   git push
   ```

## Environment Variables (See .env.example)

Required for build:
- `DATABASE_URL` - Postgres connection string
- `SESSION_SECRET` - JWT signing key (32+ chars)
- `SERVICES_SECRET_KEY` - Encryption key for stored API keys
- `TMDB_API_KEY` - The Movie Database API key
- `SONARR_URL`, `SONARR_API_KEY` - TV download automation
- `RADARR_URL`, `RADARR_API_KEY` - Movie download automation

Optional but recommended:
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` - Web push notifications (generate via `node apps/web/generate-vapid-keys.js`)
- `SMTP_*` - Email notifications

First-time setup: On fresh installs, users are guided through a setup wizard at `/setup` to create the first admin account.
