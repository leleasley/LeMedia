# Technology Stack

**Analysis Date:** 2026-01-23

## Languages

**Primary:**
- TypeScript (latest) - Full application codebase (frontend and backend)
- JavaScript (ES2022) - Configuration files and scripts

**Secondary:**
- SQL - Database migrations and initialization scripts (`/opt/LeMedia/db/`)

## Runtime

**Environment:**
- Node.js 20.19.2 (Alpine-based containers)
- npm 9.2.0 (package manager)

**Package Manager:**
- npm (workspace monorepo)
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.1.1 - Full-stack React framework with API routes
- React 19.0.0 - UI component library
- React DOM 19.0.0 - React rendering

**UI & Styling:**
- Tailwind CSS 3.4.19 - Utility-first CSS framework
- PostCSS 8.5.6 - CSS transformation tool
- Autoprefixer 10.4.23 - CSS vendor prefix automation
- Tailwind Merge 3.4.0 - Merge Tailwind classes
- Tailwind Variants 3.2.2 - CSS variable utilities
- Lucide React (latest) - Icon library
- Headless UI 2.2.9 - Unstyled component primitives
- Heroicons 2.2.0 - Heroicon SVG components
- Radix UI components:
  - `@radix-ui/react-dropdown-menu` 2.1.16
  - `@radix-ui/react-popover` 1.1.15
  - `@radix-ui/react-select` 2.2.6
  - `@radix-ui/react-slot` 1.2.4

**Testing & Build:**
- ESLint 9.39.2 - Linting
- TypeScript (latest) - Type checking

## Key Dependencies

**Critical Infrastructure:**
- pg 8.11.0 - PostgreSQL client
- node-pg-migrate 8.0.4 - Database migrations
- jose 5.9.3 - JWT (JSON Web Token) handling
- zod 4.3.5 - Runtime type validation and schema parsing

**HTTP & API:**
- axios 1.13.2 - HTTP client
- axios-rate-limit 1.4.0 - Rate limiting for axios
- web-push 3.6.7 - Web Push Notifications (PWA)

**Authentication & Security:**
- @simplewebauthn/browser 13.2.2 - WebAuthn client-side
- @simplewebauthn/server 13.2.2 - WebAuthn server-side
- nodemailer 7.0.12 - Email sending (SMTP)
- otplib 12.0.1 - One-Time Password (OTP/TOTP/HOTP)

**UI Components & Interactions:**
- react-select 5.10.2 - Advanced select/dropdown component
- react-window 2.2.5 - Virtual list rendering
- @tanstack/react-virtual 3.13.14 - React virtualization
- react-popper-tooltip 4.4.2 - Tooltip positioning
- react-pull-to-refresh 2.0.1 - Mobile pull-to-refresh
- sonner 2.0.7 - Toast notifications
- react-toast-notifications 2.5.1 - Toast notification system
- next-themes 0.4.6 - Dark/light mode theming

**Data & Utilities:**
- date-fns 4.1.0 - Date manipulation
- lodash 4.17.21 - Utility functions
- cron-parser 5.4.0 - Cron expression parsing
- ical-generator 10.0.0 - iCalendar generation
- qrcode 1.5.4 - QR code generation
- react-intl 8.0.11 - Internationalization (i18n)
- clsx 2.1.1 - Conditional CSS class utility
- mime 3.0.0 - MIME type detection
- mime-types 3.0.2 - MIME type utilities
- node-cache 5.1.2 - In-memory caching
- swr 2.3.8 - Data fetching with caching and validation

**Data Storage:**
- node-cache 5.1.2 - Server-side in-memory cache for rate limiting and API responses

## Configuration

**Environment:**
- Node environment variables loaded from `.env` (root) and `.env.example` template
- Environment validation via Zod schemas
- Production environment: `NODE_ENV=production`
- Development environment: `NODE_ENV=development`

**Key Configuration Files:**
- `tsconfig.json` - TypeScript compiler options (ES2022 target, strict mode)
- `next.config.mjs` - Next.js configuration with CSP headers, image optimization
- `tailwind.config.ts` - Tailwind CSS configuration
- `eslint.config.js` - ESLint configuration
- `.env` and `.env.example` - Environment variables
- `postcss.config.mjs` - PostCSS configuration

**Build Configuration:**
- Next.js standalone output mode (self-contained builds)
- Source maps disabled in production
- gzip compression enabled
- Image optimization enabled (1-year cache TTL for immutable images)
- Large page data bytes limit: 256000
- Server actions body size limit: 1MB

## Platform Requirements

**Development:**
- Node.js 20+
- npm 9+
- Docker (for local database)
- PostgreSQL 16+ (or Docker container)

**Production:**
- Docker container (node:20-alpine)
- PostgreSQL 16+ database
- Reverse proxy with authentication (Authelia/Authentik/Caddy)
- Optional: SMTP server for email notifications

**Deployment Target:**
- Docker Compose (standard deployment)
- Supports Portainer for management
- Kubernetes-ready (standalone Next.js output)

**Hardware Constraints:**
- CPU limits: 2 cores (container)
- Memory limits: 2GB (container)
- Memory reservation: 512MB (container)

## Special Build Features

**Security:**
- Content Security Policy (CSP) headers enforced
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: geolocation/microphone/camera disabled

**Performance:**
- Image optimization for TMDB, TheTVDB, Gravatar, Plex sources
- Aggressive caching with 1-year TTL for immutable assets
- Next.js incremental static regeneration capable

**Web Standards:**
- PWA support (Web Push Notifications)
- VAPID key-based Web Push
- CSRF protection
- Session-based authentication with JWT

---

*Stack analysis: 2026-01-23*
