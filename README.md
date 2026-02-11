# LeMedia

A comprehensive media request management platform for your homelab. LeMedia provides a beautiful web interface for browsing, requesting, and managing TV shows and movies with deep integration into your existing media stack.

## Features

### Media Discovery & Requests
- Browse and search TMDB with high-quality posters and backdrops
- View detailed TV show information including seasons and episodes
- Request specific episodes or entire seasons (Sonarr integration)
- Request movies with custom quality profiles (Radarr integration)
- Track request status and history
- Report media issues (quality, subtitles, audio problems)
- Favorites and watchlist functionality
- Recently viewed tracking
- Calendar view with upcoming releases and iCal feed support

### Authentication & Security
- **First-time setup wizard** - Guided admin account creation on fresh installs
- **Local database authentication** - Username/password login with secure session management
- **Multi-factor authentication (MFA)** - TOTP/authenticator app support
- **WebAuthn/Passkeys** - Passwordless login with FIDO2 security keys
- **OIDC/SSO integration** - Connect with your existing identity provider
- **Jellyfin authentication** - Login with Jellyfin credentials
- **Header-based auth** - Authelia/Authentik/Caddy forward_auth support
- **Cloudflare Turnstile** - Bot protection for login forms
- **Rate limiting** - Protection against brute force attacks
- **Session management** - View and revoke active sessions
- **Account suspension** - Ban problematic users

### User Management
- Multi-user support with role-based access control (admin/moderator/user)
- Per-user request limits with configurable time windows
- Auto-approval rules engine
- User permissions and preferences

### Notifications
Comprehensive notification support for keeping users informed:
- Discord
- Email (SMTP)
- Gotify
- Ntfy
- Pushbullet
- Pushover
- Slack
- Telegram
- Webhooks
- Web Push (PWA notifications)

### Integrations
- **Sonarr**: Automatic TV show downloads and monitoring
- **Radarr**: Automatic movie downloads and monitoring
- **Jellyfin**: Media library integration and availability tracking
- **TMDB**: Rich metadata and artwork
- **OMDB**: Additional metadata support
- **Prowlarr**: Indexer management (optional)

### Jellyfin Availability
LeMedia uses a local Jellyfin availability cache so TV seasons/episodes can load fast and accurately.

See `docs/JELLYFIN_AVAILABILITY.md` for setup, how the cache works, and troubleshooting.

### Administration
- Settings management for all services
- User and permission management
- Request approval workflows
- Activity/audit logs and analytics
- Job scheduling and monitoring
- Share management for collaborative requests
- Upgrade finder for quality improvements
- Maintenance mode for planned downtime
- Dashboard slider customization

## Requirements

- Docker and Docker Compose (Portainer deployment supported)
- PostgreSQL database (included in docker-compose.yml)
- Redis (included in docker-compose.yml, used for distributed rate limiting)
- TMDB API key (v3)
- OMDB API key (optional, for additional metadata)
- Sonarr instance with API key
- Radarr instance with API key
- Jellyfin server (optional, for library integration)
- Reverse proxy (recommended for production)

## Quick Start

### Installation

1. Clone or download this project:
   ```bash
   git clone https://github.com/leleasley/LeMedia.git /opt/LeMedia
   cd /opt/LeMedia
   ```

2. Copy the environment template and configure your services:
   ```bash
   cp .env.example .env
   nano .env
   ```

   Configure the following required variables:
   - `APP_BASE_URL`: Your public URL (e.g., https://lemedia.yourdomain.com)
   - `SESSION_SECRET`: Generate a strong random string
   - `SERVICES_SECRET_KEY`: Another strong random string
   - `TMDB_API_KEY`: Your TMDB v3 API key
   - `SONARR_URL` and `SONARR_API_KEY`: Your Sonarr instance details
   - `RADARR_URL` and `RADARR_API_KEY`: Your Radarr instance details
   - `DATABASE_URL`: PostgreSQL connection string (or use the provided defaults)
   - `REDIS_URL`: Redis connection string (default: `redis://lemedia-redis:6379`)

3. Start the application:
   ```bash
   docker compose up -d --build
   ```

4. Access LeMedia at your configured URL (default: `http://localhost:3010`)

5. **First-time setup**: On first launch, you'll be guided through a setup wizard to create your administrator account

### First-Time Setup

When you first start LeMedia with a fresh database, you'll be automatically redirected to the setup wizard at `/setup`. This wizard will:

1. Welcome you with an overview of LeMedia's features
2. Guide you through creating your first administrator account
3. Redirect you to the login page once complete

The setup wizard only appears once - after your admin account is created, it's disabled permanently.

### Faster rebuilds / less disk usage

- If you only changed runtime config in `.env` (URLs, API keys, DB string), you **do not need to rebuild**:
  - `docker compose up -d`
- Only use `--build` when you changed code or dependencies:
  - `docker compose up -d --build`

If disk usage grows over time, it's usually Docker build cache:
- `docker builder prune -af` (build cache)
- `docker image prune -af` (unused images)

### Local IP Staging Preview (Safe Test Path)

If you want to test changes from another device via local IP before publishing to your domain, use a separate staging web container.

1. Create staging env overrides:
   ```bash
   cp .env.staging.example .env.staging
   nano .env.staging
   ```

2. Set `APP_BASE_URL` in `.env.staging` to your server LAN IP and staging port, for example:
   - `APP_BASE_URL=http://192.168.1.50:3011`

3. Start staging preview only:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.staging.yml --profile staging up -d --build lemedia-web-staging
   ```

4. Browse staging at:
   - `http://<your-server-ip>:3011`

5. Stop staging when done:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.staging.yml --profile staging stop lemedia-web-staging
   ```

Notes:
- Production publish flow stays the same:
  - `docker compose up -d --build lemedia-web`
- Staging defaults keep risk lower:
  - `JOB_SCHEDULER_ENABLED=0`
  - `NOTIFICATIONS_ENABLED=false`

### Reverse Proxy Configuration (Optional)

For production deployments, you can use a reverse proxy with SSO. LeMedia supports these headers from your authentication layer:
- `Remote-User`: The authenticated username
- `Remote-Groups`: Comma-separated list of groups

#### Caddy with Authelia Example

```caddyfile
lemedia.yourdomain.com {
  # Import your Authelia forward_auth configuration
  import authelia

  # Proxy to LeMedia
  reverse_proxy localhost:3010
}
```

#### Manual Header Configuration

If you're using a different auth provider:

```caddyfile
lemedia.yourdomain.com {
  forward_auth your-auth-provider:port {
    uri /verify
    copy_headers Remote-User Remote-Groups
  }

  reverse_proxy localhost:3010
}
```

## Development

### Local Development Mode

For local development without a reverse proxy:

1. Set in your `.env`:
   ```
   ALLOW_DEV_BYPASS=1
   DEV_USER=yourusername
   DEV_GROUPS=admins
   ```

2. Run the development server:
   ```bash
   cd apps/web
   npm run dev
   ```

**WARNING**: Never enable `ALLOW_DEV_BYPASS` in production!

### CSRF Protection

LeMedia uses a CSRF cookie (`lemedia_csrf`) to protect state-changing routes.

- Client calls should use `csrfFetch` from `apps/web/src/lib/csrf-client.ts`, which attaches the `x-csrf-token` header from the cookie.
- Server routes validate the token via `requireCsrf` and reject unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) when the token is missing.
- The token is issued by the CSRF API route (`/api/csrf` or `/api/v1/csrf`) and stored as a cookie for browser requests.

### Rebuilding

- **Config changes only** (`.env` modifications): `docker compose up -d`
- **Code or dependency changes**: `docker compose up -d --build`

### Cleanup

If Docker disk usage grows over time:
```bash
docker builder prune -af    # Clear build cache
docker image prune -af      # Remove unused images
```

## Configuration

### Redis Host Tuning (Linux)

If Redis logs a warning about memory overcommit, apply this on the Docker host:

```bash
# Apply immediately
sudo sysctl -w vm.overcommit_memory=1

# Persist across reboots
echo "vm.overcommit_memory=1" | sudo tee /etc/sysctl.d/99-redis.conf
sudo sysctl --system
```

Then restart Redis:

```bash
docker compose restart lemedia-redis
docker compose logs -f lemedia-redis
```

### Web Push Notifications

To enable PWA push notifications:

1. Generate VAPID keys:
   ```bash
   node apps/web/generate-vapid-keys.js
   ```

2. Add the keys to your `.env`:
   ```
   VAPID_PUBLIC_KEY=your-public-key
   VAPID_PRIVATE_KEY=your-private-key
   VAPID_EMAIL=noreply@yourdomain.com
   ```

### Cloudflare Turnstile (Bot Protection)

To enable Turnstile on login forms:

1. Create a Turnstile widget at [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Add to your `.env`:
   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-site-key
   TURNSTILE_SECRET_KEY=your-secret-key
   ```

### Multi-Factor Authentication

MFA can be enabled globally in Admin Settings > General. When enabled:
- New users will be prompted to set up TOTP on first login
- Existing users can manage MFA in their profile settings
- Admins can enforce MFA for all users or just administrators

## Technical Details

### Episode Requests

LeMedia supports requesting specific episodes from TV shows. This works by:
1. Fetching TVDB ID from TMDB external IDs
2. Using Sonarr's `tvdb:<id>` series lookup capability
3. Allowing granular episode selection per season

### Authentication Flow

LeMedia supports multiple authentication methods:

1. **Local Auth**: Username/password stored in database with bcrypt hashing
2. **MFA**: Optional TOTP verification after password
3. **WebAuthn**: Passwordless login with security keys/passkeys
4. **OIDC/SSO**: Redirect to external identity provider
5. **Jellyfin**: Authenticate against your Jellyfin server
6. **Header-based**: Trust headers from reverse proxy (Authelia/Authentik)

Session is maintained via secure HTTP-only cookies with configurable expiry.

### Database

LeMedia uses PostgreSQL for data persistence:
- User profiles and preferences
- Request history and status
- Notification configurations
- Approval workflows
- Analytics and audit logs
- Session management
- MFA secrets and WebAuthn credentials

Migrations run automatically on startup.

## Architecture

- **Frontend**: Next.js 16 with App Router and React 19
- **Backend**: Next.js API routes
- **Database**: PostgreSQL with automatic migrations
- **Authentication**: Multi-method (local, MFA, WebAuthn, OIDC, Jellyfin, headers)
- **Deployment**: Docker + Docker Compose
- **Media Services**: Sonarr, Radarr, Jellyfin APIs

## API

LeMedia exposes a REST API at `/api/v1/*` for integration with other services. Authentication is required via session cookie or API token.

Key endpoints:
- `GET /api/v1/requests` - List requests
- `POST /api/v1/request/movie` - Request a movie
- `POST /api/v1/request/episode` - Request TV episodes
- `GET /api/v1/calendar` - Get calendar events
- `GET /api/health` - Health check endpoint

## Support

For issues, feature requests, or contributions, please use the issue tracker on the project repository.

## License

See LICENSE file for details.
