# External Integrations

**Analysis Date:** 2026-01-23

## APIs & External Services

**Media Metadata:**
- **TMDB (The Movie Database)** - Movie and TV show metadata, artwork, search
  - SDK/Client: Axios-based wrapper in `src/lib/tmdb.ts`
  - Auth: API key via `TMDB_API_KEY` environment variable
  - Base URL: `https://api.themoviedb.org/3`
  - Rate limit: Configurable via `TMDB_RATE_LIMIT_REQUESTS` (default 20) and `TMDB_RATE_LIMIT_RPS` (default 50)
  - Image sources: `image.tmdb.org` (remote pattern allowed in CSP)
  - Caching: 5-minute default TTL via node-cache

- **OMDB (Open Movie Database)** - Additional metadata support
  - Auth: API key via `OMDB_API_KEY` environment variable
  - Purpose: Supplementary metadata (optional)

- **TheTVDB** - TV show metadata
  - Image sources: `artworks.thetvdb.com` (remote pattern allowed in CSP)
  - Used for TV show identification and artwork

**Media Delivery Services:**
- **Sonarr** - Automatic TV show downloads and monitoring
  - Connection: HTTP API
  - Base URL: `SONARR_URL` (default: `http://sonarr:8989`)
  - Auth: API key via `SONARR_API_KEY`
  - Configuration stored in database (service config)
  - API endpoints: `/api/v3/` (quality profiles, root folders, tags, language profiles, series lookup)
  - Client: `src/lib/sonarr.ts` with `createSonarrFetcher()` wrapper
  - Required settings:
    - Root folder path (`SONARR_ROOT_FOLDER`)
    - Quality profile ID (`SONARR_QUALITY_PROFILE_ID`)
    - Language profile ID (`SONARR_LANGUAGE_PROFILE_ID`, optional)
    - Series type (`SONARR_SERIES_TYPE`, standard)
    - Season folder structure (`SONARR_SEASON_FOLDER`, boolean)

- **Radarr** - Automatic movie downloads and monitoring
  - Connection: HTTP API
  - Base URL: `RADARR_URL` (default: `http://radarr:7878`)
  - Auth: API key via `RADARR_API_KEY`
  - Configuration stored in database (service config)
  - API endpoints: `/api/v3/` (quality profiles, root folders, tags)
  - Client: `src/lib/radarr.ts` with `createRadarrFetcher()` wrapper
  - Required settings:
    - Root folder path (`RADARR_ROOT_FOLDER`)
    - Quality profile ID (`RADARR_QUALITY_PROFILE_ID`)
    - Minimum availability (`RADARR_MINIMUM_AVAILABILITY`, e.g., "released")

**Media Library:**
- **Jellyfin** - Media library integration and availability checking
  - Connection: HTTP API + Database cache
  - Base URL: Configured in admin settings
  - Auth: X-Emby-Token header (API key)
  - Purpose: Check media availability, import user library, track watch history
  - API endpoints: `/Items/`, `/Users/`, `/Library/`, etc.
  - Local cache: `jellyfin_availability_cache` table with 10-minute TTL
  - Sync jobs: Background sync for availability and new items
  - Files: `src/lib/jellyfin.ts`, `src/lib/jellyfin-admin.ts`, `src/lib/jellyfin-availability-sync.ts`

## Data Storage

**Databases:**
- **PostgreSQL 16+**
  - Connection: `DATABASE_URL` environment variable
  - Client: `pg` (node-postgres)
  - Driver: TCP connection
  - Default connection: `postgres://lemedia:lemedia@lemedia-db:5432/lemedia`
  - Database name configurable via `POSTGRES_DB` (default: lemedia)
  - ORM/Migrations: node-pg-migrate for schema management

**Key Tables:**
- `app_user` - User accounts, authentication, settings
- `notification_endpoint` - Discord, Email, Telegram, Webhook configs
- `user_notification_endpoint` - Per-user notification subscriptions
- `session` - Active user sessions (JTI-based)
- `media_request` - Movie/TV show requests
- `jellyfin_availability_cache` - Local cache of Jellyfin availability
- `jobs` - Job scheduling and execution history
- `push_subscription` - Web Push notification subscriptions
- Jobs system tables for scheduled background tasks

**File Storage:**
- Local filesystem (via Next.js public directory and avatar storage)
- No cloud storage integration detected
- Image proxy for remote media artwork (TMDB, TheTVDB, Plex, Gravatar)

**Caching:**
- In-memory: `node-cache` instances for API response caching
- Database: Jellyfin availability cache table
- Browser: Service Worker cache for PWA
- Shared cache buckets:
  - "tmdb" - TMDB API responses (5-min TTL)
  - "external_api" - Generic external API cache

## Authentication & Identity

**Auth Provider:**
- **Custom Session-Based** - Header-based authentication via reverse proxy
  - Implementation: JWT tokens stored in cookies (`lemedia_session`)
  - Token algorithm: HS256
  - Session secret: `SESSION_SECRET` (min 32 characters)
  - Session persistence: Database table `session` tracks active sessions by JTI
  - Expiration: Configurable max age (standard: 24 hours)

- **OIDC (OpenID Connect)** - Optional identity federation
  - Configuration: Admin settings endpoint
  - Files: `src/app/api/auth/oidc/` routes
  - Callback URL: `/api/auth/oidc/callback`
  - User mapping: Maps OIDC `sub` to app_user via `oidc_sub` column

- **WebAuthn (FIDO2)** - Passwordless authentication
  - Libraries: @simplewebauthn/browser, @simplewebauthn/server
  - Endpoints: `/api/auth/webauthn/register/`, `/api/auth/webauthn/login/`
  - Credential storage: Database table `webauthn_credential`
  - Files: `src/app/api/auth/webauthn/` routes

- **Multi-Factor Authentication (MFA)**
  - Type: TOTP (Time-based One-Time Password)
  - Library: otplib
  - QR Code: Generated via qrcode package
  - Backup codes: Stored encrypted in database
  - Endpoints: `/api/mfa/setup/`, `/api/mfa/verify/`

- **Jellyfin Integration**
  - User linking: Map Jellyfin user to app user
  - Auth token: Stored encrypted in app_user table (`jellyfin_auth_token`)
  - Device ID: For Jellyfin API calls

**Authorization:**
- Group-based access control (configured via `AUTH_ADMIN_GROUP`)
- Default admin group: "admins" (case-insensitive)
- Groups stored in `app_user.groups` as semicolon/comma-separated string
- Per-request validation: Groups cached for 1 minute

**Secrets Management:**
- Session secret: `SESSION_SECRET` (required, min 32 chars)
- API key secret: `SERVICES_SECRET_KEY` (for external API key encryption)
- Secret rotation: Previous secret via `SERVICES_SECRET_KEY_PREVIOUS`
- Encryption: Custom encryption util in `src/lib/encryption.ts`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, LogRocket, etc.)
- Application-level error logging via custom logger

**Logs:**
- Console-based logging during development
- No centralized logging service detected
- Debug flag: `AUTH_DEBUG=1` enables auth debug logs
- Logger utility: `src/lib/logger.ts` for structured logging
- Audit logging: `src/lib/audit-log.ts` for user action tracking

**Health Checks:**
- Docker health check: `GET /api/health` (checks database connectivity)
- Interval: 30 seconds, timeout: 10 seconds, retries: 3, start period: 40 seconds
- Endpoint: `/api/admin/status/health/route.ts`

## CI/CD & Deployment

**Hosting:**
- Docker Compose (primary)
- Portainer-compatible (management UI)
- Kubernetes-ready (Next.js standalone output)
- Self-hosted (no cloud platform lock-in)

**Container:**
- Base image: `node:20-alpine`
- Multi-stage build: deps → build → run
- Non-root user: `nextjs` (UID 1001)
- Ports: 3010 (application)
- Volumes: `/opt/LeMedia/db/data` for PostgreSQL persistence

**CI Pipeline:**
- No CI/CD service detected (no GitHub Actions, GitLab CI, etc.)
- Manual deployment via docker-compose

**Build Process:**
- Next.js build with standalone output
- Environment-based secrets at build time (DATABASE_URL, SESSION_SECRET, VAPID keys)
- Cache mounts for npm and .next build cache
- Output: Self-contained Node.js application with embedded server

## Environment Configuration

**Required Environment Variables:**

Core:
- `NODE_ENV` - Application environment (production/development)
- `PORT` - Server port (default: 3010)
- `APP_BASE_URL` - Public application URL (for redirects, links)
- `INTERNAL_APP_BASE_URL` - Internal URL for calendar generation (default: http://lemedia-web:3010)

Authentication:
- `SESSION_SECRET` - JWT signing secret (min 32 characters, required)
- `SERVICES_SECRET_KEY` - Secret for encrypting API keys (required)
- `SERVICES_SECRET_KEY_PREVIOUS` - Previous secret for rotation
- `AUTH_ADMIN_GROUP` - Admin group name (default: "admins")
- `ALLOW_DEV_BYPASS` - Enable dev user bypass (0=disabled, must be 0 in production)

User Seeding:
- `APP_SEED_USER` - Initial user username (optional)
- `APP_SEED_PASSWORD` - Initial user password (optional)
- `APP_SEED_GROUPS` - Initial user groups (default: "admins")

Media Services:
- `TMDB_API_KEY` - TMDB v3 API key (required)
- `OMDB_API_KEY` - OMDB API key (optional)
- `SONARR_URL` - Sonarr base URL (required for TV requests)
- `SONARR_API_KEY` - Sonarr API key (required)
- `SONARR_ROOT_FOLDER` - Sonarr root path
- `SONARR_QUALITY_PROFILE_ID` - Quality profile ID
- `SONARR_LANGUAGE_PROFILE_ID` - Language profile ID
- `SONARR_SERIES_TYPE` - Series type (standard)
- `SONARR_SEASON_FOLDER` - Use season folders (true/false)
- `RADARR_URL` - Radarr base URL (required for movie requests)
- `RADARR_API_KEY` - Radarr API key (required)
- `RADARR_ROOT_FOLDER` - Radarr root path
- `RADARR_QUALITY_PROFILE_ID` - Quality profile ID
- `RADARR_MINIMUM_AVAILABILITY` - Minimum availability status

Database:
- `DATABASE_URL` - PostgreSQL connection string (required)
- `POSTGRES_DB` - Database name for Docker (default: lemedia)
- `POSTGRES_USER` - Database user for Docker (default: lemedia)
- `POSTGRES_PASSWORD` - Database password (required)

Email/SMTP:
- `SMTP_HOST` - SMTP server hostname (required for email notifications)
- `SMTP_PORT` - SMTP port (default: 587)
- `SMTP_USER` - SMTP username (optional if no auth)
- `SMTP_PASS` - SMTP password (optional if no auth)
- `SMTP_FROM` - From email address (required for email notifications)
- `SMTP_SECURE` - Use TLS (true/false, default: false)

Web Push:
- `VAPID_PUBLIC_KEY` - VAPID public key for Web Push (required for PWA)
- `VAPID_PRIVATE_KEY` - VAPID private key for Web Push (required for PWA)
- `VAPID_EMAIL` - Email for VAPID keys (required for PWA)

Optional Features:
- `NEXT_PUBLIC_APP_NAME` - Application name displayed in UI
- `NEXT_PUBLIC_MEDIA_GRID_INITIAL_PAGES` - Initial pagination pages (default: 2)
- `NOTIFICATIONS_ENABLED` - Enable notification system (default: true)
- `NEXT_PUBLIC_TMDB_API_KEY` - Public TMDB key for client-side (alternative to server-side)
- `TMDB_RATE_LIMIT_REQUESTS` - TMDB rate limit requests (default: 20)
- `TMDB_RATE_LIMIT_RPS` - TMDB rate limit RPS (default: 50)

**Secrets Location:**
- `.env` file at project root (not in git)
- `.env.example` as template in repository
- Build-time secrets passed via Docker ARG
- Runtime secrets loaded from environment or `.env` file

## Webhooks & Callbacks

**Incoming:**
- Jellyfin webhook endpoints (for new items, updates)
- Sonarr/Radarr webhook callbacks (optional, for download notifications)
- OIDC callback: `/api/auth/oidc/callback`
- User profile routes for Jellyfin linking

**Outgoing:**
- Notification webhooks: Generic webhook endpoint type for custom integrations
- Discord webhooks: Direct message posting
- Email notifications: SMTP outbound
- Telegram: Bot API calls
- Slack: Incoming webhooks
- Push notifications: Web Push to subscribed browsers
- Gotify, ntfy, Pushbullet, Pushover: Direct API calls

**Notification Events:**
- `request_pending` - Request awaiting approval
- `request_submitted` - Request created
- `request_denied` - Request rejected
- `request_failed` - Request failed to process
- `request_already_exists` - Duplicate request
- `issue_reported` - User reported an issue

---

*Integration audit: 2026-01-23*
