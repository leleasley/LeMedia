# Codebase Structure

**Analysis Date:** 2026-01-23

## Directory Layout

```
/opt/LeMedia/
├── apps/
│   └── web/                          # Main Next.js application
│       ├── app/                      # Next.js App Router (pages and routes)
│       │   ├── layout.tsx            # Root layout (providers, metadata)
│       │   ├── globals.css           # Tailwind + custom styles
│       │   ├── (app)/                # Authenticated app routes group
│       │   │   ├── layout.tsx        # App layout (sidebar, header, auth check)
│       │   │   └── (dashboard)/      # Dashboard route group
│       │   ├── api/                  # API routes (366 endpoints total)
│       │   │   ├── v1/               # API v1 endpoints
│       │   │   ├── admin/            # Admin API routes
│       │   │   ├── auth/             # Authentication routes
│       │   │   ├── login/            # Login endpoints
│       │   │   └── [other]/          # Feature-specific endpoints
│       │   ├── login/                # Login page
│       │   ├── (public)/             # Public routes (not requiring auth)
│       │   └── [other]/              # Error pages, special routes
│       ├── src/                      # Source code (non-page files)
│       │   ├── auth.ts               # Authentication logic (getUser, requireUser)
│       │   ├── db.ts                 # Database queries (146KB, 200+ functions)
│       │   ├── lib/                  # Service layer and utilities
│       │   │   ├── jobs/             # Background job scheduler
│       │   │   ├── tmdb.ts           # TMDB API client
│       │   │   ├── sonarr.ts         # Sonarr integration
│       │   │   ├── radarr.ts         # Radarr integration
│       │   │   ├── jellyfin.ts       # Jellyfin library integration
│       │   │   ├── request-sync.ts   # Sync requests with external services
│       │   │   ├── media-status.ts   # Media availability logic
│       │   │   ├── encryption.ts     # Service credential encryption
│       │   │   ├── local-cache.ts    # In-memory caching
│       │   │   └── [others]/         # 70+ utility modules
│       │   ├── components/           # React components (25+ directories)
│       │   │   ├── Admin/            # Admin-specific components
│       │   │   ├── Layout/           # Header, sidebar, nav
│       │   │   ├── Requests/         # Request creation/management
│       │   │   ├── Discover/         # Media discovery and search
│       │   │   ├── Movie/            # Movie detail components
│       │   │   ├── Tv/               # TV show detail components
│       │   │   ├── Providers/        # Context providers (SWR, Theme, Intl)
│       │   │   ├── ui/               # Base UI components (Radix + Tailwind)
│       │   │   └── [others]/         # Feature components
│       │   ├── types/                # TypeScript type definitions
│       │   │   ├── server/           # Server-side types
│       │   │   │   ├── api/          # API response types
│       │   │   │   ├── entity/       # Database entity types
│       │   │   │   ├── models/       # Domain model types
│       │   │   │   └── constants/    # Type constants
│       │   │   └── mime-lite.d.ts    # Type declarations
│       │   ├── hooks/                # React hooks (custom useHaptic, useIsApple, etc.)
│       │   ├── utils/                # Utility functions (typeHelpers, defineMessages)
│       │   ├── notifications/        # Notification dispatchers
│       │   │   ├── request-events.ts # Request notification events
│       │   │   ├── issue-events.ts   # Issue notification events
│       │   │   ├── weekly-digest.ts  # Weekly digest email
│       │   │   └── [others]/         # Discord, Slack, Telegram, etc.
│       │   ├── i18n/                 # Internationalization (react-intl setup)
│       │   ├── assets/               # Static assets
│       │   └── scripts/              # Database migration scripts
│       ├── public/                   # Static files served at root
│       │   ├── splash/               # PWA splash screens
│       │   └── manifest.json         # PWA manifest
│       ├── package.json              # Dependencies (React 19, Next 16, Tailwind, Radix UI)
│       ├── tsconfig.json             # Path aliases: @/* → ./src/*
│       ├── tailwind.config.ts        # Tailwind configuration
│       ├── next.config.mjs           # Next.js config (CSP, image optimization)
│       └── Dockerfile                # Docker build configuration
├── db/                               # Database migrations and schema
│   └── migrations/                   # SQL migration files
├── .env                              # Environment variables (not in git)
├── .env.example                      # Environment template
├── docker-compose.yml                # Docker Compose for local dev
├── package.json                      # Workspace root
└── README.md                         # Project documentation
```

## Directory Purposes

**`/opt/LeMedia/apps/web/app/`:**
- Purpose: Next.js App Router directory; pages and API routes automatically become endpoints
- Contains: Page components, layout components, route handlers
- Key files: `layout.tsx` (root), `(app)/layout.tsx` (auth group), `api/*` (all endpoints)

**`/opt/LeMedia/apps/web/src/lib/`:**
- Purpose: Service layer and shared business logic
- Contains: 70+ modules for integrations (TMDB, Sonarr, Radarr, Jellyfin), utilities (caching, encryption, logging)
- Key files: `tmdb.ts`, `sonarr.ts`, `radarr.ts`, `jellyfin.ts`, `request-sync.ts`, `media-status.ts`
- Largest files: `jellyfin.ts` (30KB), `tmdb.ts` (13KB), `request-sync.ts` (12KB)

**`/opt/LeMedia/apps/web/src/components/`:**
- Purpose: All React components, organized by feature
- Contains: Page components, layout, UI elements, providers
- Subdirectories: 25+ folders like Admin, Layout, Requests, Discover, Movie, Tv, ui (base components)
- Pattern: Components use TypeScript, server/client boundaries clearly marked with "use client"

**`/opt/LeMedia/apps/web/src/types/server/`:**
- Purpose: Type definitions for server-side logic
- Contains: API response types, database entity types, domain models, constants
- Subdirectories: `api/`, `entity/`, `models/`, `constants/`

**`/opt/LeMedia/apps/web/src/notifications/`:**
- Purpose: Event-driven notification dispatchers
- Contains: 9 files handling request events, issue events, email digests
- Pattern: Functions triggered by state changes (request approved, available, new episodes)
- Supported channels: Discord, email, Gotify, Ntfy, Pushbullet, Pushover, Slack, Telegram, webhooks

**`/opt/LeMedia/apps/web/src/lib/jobs/`:**
- Purpose: Background job scheduling system
- Contains: `index.ts` (cron scheduler with DB locks), `definitions.ts` (job handlers)
- Jobs: request-sync (5 min), watchlist-sync (daily), weekly-digest, session-cleanup, calendar-notifications, jellyfin-availability-sync

**`/opt/LeMedia/apps/web/public/`:**
- Purpose: Static assets served at root via CDN cache
- Contains: PWA manifest, splash screens, favicons, icon assets
- Caching: 1-year immutable cache for all static files per `next.config.mjs`

**`/opt/LeMedia/db/migrations/`:**
- Purpose: PostgreSQL schema migrations
- Pattern: node-pg-migrate format; run via `npm run migrate` script
- Contains: User, request, settings, Jellyfin cache, job tables, etc.

## Key File Locations

**Entry Points:**

- `app/layout.tsx`: Root HTML document, theme provider, PWA setup, flash messages
- `app/(app)/layout.tsx`: Authenticated app container; fetches user, admin stats, maintenance state
- `app/api/v1/*/route.ts`: 366 API endpoints (search, request creation, profile, admin, settings)
- `src/lib/jobs/index.ts`: Job scheduler started at app startup

**Configuration:**

- `next.config.mjs`: Image optimization, CSP headers, caching policy
- `tailwind.config.ts`: Tailwind design tokens and custom utilities
- `tsconfig.json`: Path aliases (`@/*` → `./src/*`), strict mode enabled
- `.env`: Environment variables for services, secrets, database URL

**Core Logic:**

- `src/auth.ts`: Session verification, user groups, admin role mapping
- `src/db.ts`: 200+ database query functions (users, requests, settings, jobs)
- `src/lib/tmdb.ts`: TMDB API client for movie/TV metadata
- `src/lib/sonarr.ts`: Sonarr API client for TV show management
- `src/lib/radarr.ts`: Radarr API client for movie management
- `src/lib/jellyfin.ts`: Jellyfin library scanning and metadata queries
- `src/lib/request-sync.ts`: Synchronize pending requests with Sonarr/Radarr
- `src/lib/media-status.ts`: Compute media availability across all sources

**Testing:**

- No dedicated test files found; testing not implemented in current codebase
- Recommendation: Add `*.test.ts` and `*.spec.ts` files co-located with components/utilities

## Naming Conventions

**Files:**

- Service modules: `kebab-case.ts` (e.g., `request-sync.ts`, `jellyfin-scan.ts`)
- React components: `PascalCase/index.tsx` (e.g., `src/components/Admin/index.tsx`)
- Pages: `page.tsx` and `layout.tsx` (Next.js convention)
- Utilities: `kebab-case.ts` (e.g., `cache-manager.ts`, `rate-limit.ts`)

**Directories:**

- Feature folders: `PascalCase` (e.g., `Admin/`, `Requests/`, `Tv/`)
- Utility folders: `kebab-case` (e.g., `src/lib/jobs/`, `src/components/ui/`)

**Components:**

- Page components: Export default function named same as directory (e.g., `Admin` for `Admin/index.tsx`)
- Client components: Mark with `"use client"` at top
- Server components: Default (no directive needed)
- Props interfaces: Component name + "Props" suffix (e.g., `AdminProps`)

**Database:**

- Tables: `snake_case` (e.g., `media_request`, `app_user`, `service_settings`)
- Columns: `snake_case` (e.g., `created_at`, `updated_at`, `tmdb_id`)
- Functions: `camelCase` and descriptive (e.g., `getUserWithHash()`, `upsertUser()`)

**Functions:**

- Exported from db.ts: Prefix none (e.g., `getRequestCounts()`, `createRequest()`)
- Handlers: Suffix "Handler" (e.g., `requestInterceptorFunction()`)
- Queries: Prefix "get", "list", "create", "update", "delete"

## Where to Add New Code

**New Feature:**
- Primary code: `src/lib/[feature-name].ts` (if business logic) or `src/components/[FeatureName]/` (if UI)
- API routes: `app/api/v1/[feature]/route.ts`
- Types: `src/types/server/[feature].ts`
- Tests: `src/lib/[feature-name].test.ts` or `src/components/[FeatureName]/*.test.tsx`

**New Component/Module:**
- Page component: `app/(app)/[feature]/page.tsx`
- Layout component: `src/components/[FeatureName]/index.tsx`
- UI component: `src/components/ui/[component-name].tsx`
- Utility module: `src/lib/[feature-name].ts`

**Utilities:**
- Shared helpers: `src/lib/utils.ts` or `src/lib/[domain]-utils.ts`
- Type helpers: `src/utils/typeHelpers.ts`
- Hooks: `src/hooks/use[Feature].ts`

**Database:**
- New query functions: Add to `src/db.ts` (keep all DB access in one file)
- Migration: Create new file in `db/migrations/` with timestamp prefix

**Notifications:**
- New notification type: Add handler function to `src/notifications/[service].ts` or create new file
- Event triggers: Add dispatch call in route handler that triggers event

## Special Directories

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (in `.gitignore`)

**`node_modules/`:**
- Purpose: Installed npm dependencies
- Generated: Yes (via `npm install`)
- Committed: No (in `.gitignore`)

**`public/splash/`:**
- Purpose: PWA splash screen images for iOS devices
- Generated: No
- Committed: Yes (required for PWA functionality)

**`db/migrations/`:**
- Purpose: PostgreSQL schema versioning
- Generated: No (manually created)
- Committed: Yes
- Pattern: Each file is a discrete schema change; run in order via `npm run migrate`

**`app/.next/types/`:**
- Purpose: Next.js auto-generated type definitions
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-01-23*
