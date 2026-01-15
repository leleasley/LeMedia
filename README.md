# LeMedia

A comprehensive media request management platform for your homelab. LeMedia provides a beautiful web interface for browsing, requesting, and managing TV shows and movies with deep integration into your existing media stack.

## Features

### Media Discovery & Requests
- Browse and search TMDB with high-quality posters and backdrops
- View detailed TV show information including seasons and episodes
- Request specific episodes or entire seasons (Sonarr integration)
- Request movies with custom quality profiles (Radarr integration)
- Track request status and history

### User Management
- Multi-user support with role-based access control
- Header-based authentication (Authelia/Authentik/Caddy forward_auth)
- Admin and user groups with granular permissions
- Approval workflows for user requests

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
- **Jellyfin**: Media library integration
- **TMDB**: Rich metadata and artwork
- **OMDB**: Additional metadata support

### Administration
- Settings management for all services
- User and permission management
- Request approval workflows
- Activity logs and analytics
- Job scheduling and monitoring
- Share management for collaborative requests

## Why Header-Based Auth?

LeMedia uses header-based authentication because it integrates seamlessly with modern reverse proxy SSO solutions like Authelia, Authentik, or Caddy's forward_auth. This means you get enterprise-grade authentication without reinventing the wheel - just use your existing homelab auth stack.

## Requirements

- Docker and Docker Compose (Portainer deployment supported)
- PostgreSQL database (included in docker-compose.yml)
- TMDB API key (v3)
- OMDB API key (optional, for additional metadata)
- Sonarr instance with API key
- Radarr instance with API key
- Jellyfin server (optional, for library integration)
- Reverse proxy with authentication (Caddy + Authelia/Authentik recommended)

## Quick Start

### Installation

1. Clone or download this project to `/opt/LeMedia`

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
   - SMTP settings for email notifications (if using email notifications)

3. Start the application:
   ```bash
   docker compose up -d --build
   ```

4. Configure your reverse proxy with authentication (see example below)

5. Access LeMedia at your configured URL and log in with your SSO provider

### Faster rebuilds / less disk usage

- If you only changed runtime config in `.env` (URLs, API keys, DB string), you **do not need to rebuild**:
  - `docker compose up -d`
- Only use `--build` when you changed code or dependencies:
  - `docker compose up -d --build`

If disk usage grows over time, it’s usually Docker build cache:
- `docker builder prune -af` (build cache)
- `docker image prune -af` (unused images)

### Caddy Configuration Example

LeMedia requires the following headers to be passed from your authentication layer:
- `Remote-User`: The authenticated username
- `Remote-Groups`: Comma-separated list of groups (must include your admin group for admin access)

#### With Authelia

```caddyfile
lemedia.yourdomain.com {
  # Import your Authelia forward_auth configuration
  import authelia

  # Proxy to LeMedia
  reverse_proxy localhost:3010
}
```

#### Manual Header Configuration

If you're using a different auth provider, ensure these headers are set:

```caddyfile
lemedia.yourdomain.com {
  # Your auth middleware here
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
   npm run dev
   ```

**WARNING**: Never enable `ALLOW_DEV_BYPASS` in production!

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

### First User Setup

You can seed an initial admin user by setting:
```
APP_SEED_USER=admin
APP_SEED_PASSWORD=changeme
APP_SEED_GROUPS=admins
```

This user will be created on first startup if it doesn't exist.

## Technical Details

### Episode Requests

LeMedia supports requesting specific episodes from TV shows. This works by:
1. Fetching TVDB ID from TMDB external IDs
2. Using Sonarr's `tvdb:<id>` series lookup capability
3. Allowing granular episode selection per season

### Authentication Flow

1. User authenticates with your SSO provider (Authelia/Authentik)
2. Reverse proxy validates and sets `Remote-User` and `Remote-Groups` headers
3. LeMedia reads headers to identify user and permissions
4. Session is maintained via secure cookies

### Database

LeMedia uses PostgreSQL for data persistence:
- User profiles and preferences
- Request history and status
- Notification configurations
- Approval workflows
- Analytics and logs

## Architecture

- **Frontend**: Next.js 14+ with App Router
- **Backend**: Next.js API routes
- **Database**: PostgreSQL
- **Authentication**: Header-based (reverse proxy SSO)
- **Deployment**: Docker + Docker Compose
- **Media Services**: Sonarr, Radarr, Jellyfin APIs

## Support

For issues, feature requests, or contributions, please use the issue tracker on the project repository.

## License

See LICENSE file for details. 
