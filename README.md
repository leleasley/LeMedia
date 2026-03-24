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
- **Request comments** — threaded discussion on individual requests (admin-only notes supported)
- Favorites and watchlist functionality
- Recently viewed tracking
- Calendar view with upcoming releases and iCal feed support

### Authentication & Security
- **First-time setup wizard** - Guided admin account creation on fresh installs
- **Local database authentication** - Username/password login with secure session management
- **Password reset** - Forgot-password flow with time-limited single-use tokens
- **Multi-factor authentication (MFA)** - TOTP/authenticator app support
- **WebAuthn/Passkeys** - Passwordless login with FIDO2 security keys
- **OIDC/SSO integration** - Connect with your existing identity provider
- **Jellyfin authentication** - Login with Jellyfin credentials
- **Google & GitHub OAuth** - Sign in with linked Google or GitHub accounts
- **Telegram OAuth** - Sign in with Telegram via BotFather Web Login
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
- API token management per user

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
- **Telegram Bot** — interactive bot for requests, status checks, and admin actions (see [Telegram Bot](#telegram-bot))

Notification events include: request approved/denied, media available, new episodes, **episode air reminders** (24 h and 1 h before air), followed media release dates, weekly digest, and system alerts.

### Social & Community
LeMedia has a full social layer for multi-user homelabs:

- **User profiles** — bio, banner, display name, and privacy controls (public / friends / private)
- **Friend system** — send/accept friend requests, view mutual friends, block users
- **Following** — follow users to see their activity in your feed
- **Social feed** — activity stream from friends and followed users
- **Discover people** — find users with similar taste, new members, and trending profiles
- **Mutual taste** — see shared media, genres, and list overlap with any friend
- **Public profiles** ( `/u/[username]` ) — browsable stats, reviews, and lists per user

### Custom Lists
- Create named lists of movies and TV shows
- Visibility tiers: private, friends-only, or public
- Share via public URL slug
- Cover image from TMDB media or custom upload
- Mood and occasion tags
- **Reactions** — emoji reactions (like, love, fire, mind-blown, clap)
- **Comments** — threaded comments with @mentions
- **Saves & remixes** — save others' lists or create a remixed copy
- List pinning on your public profile

### Reviews
- 1–5 star ratings for movies and TV shows
- Text reviews with spoiler warnings
- Threaded review comments with @mentions
- Browse public reviews from the community
- **Letterboxd sync** — automatically import your Letterboxd reviews and star ratings

### Taste Profile & Recommendations
- **Taste profile quiz** — rate 18 genres, mood preferences, content preferences, and more
- **Personalized recommendations** — movie and TV suggestions driven by your profile
- Retake the quiz at any time to update your recommendations

### Integrations
- **Sonarr** — automatic TV show downloads and monitoring
- **Radarr** — automatic movie downloads and monitoring
- **Jellyfin** — media library integration and availability tracking (see [Jellyfin Availability](#jellyfin-availability))
- **Plex** — media library integration and availability tracking (see [Plex Availability](#plex-availability))
- **Trakt** — OAuth account linking and watchlist import
- **Letterboxd** — automatic review and rating import via RSS
- **TMDB** — rich metadata and artwork (primary source)
- **OMDB** — additional metadata (optional)
- **Rotten Tomatoes** — critic and audience scores displayed on media pages
- **Prowlarr** — indexer management (optional)

### Jellyfin Availability
LeMedia uses a local Jellyfin availability cache so TV seasons/episodes can load fast and accurately.

See `docs/JELLYFIN_AVAILABILITY.md` for setup, how the cache works, and troubleshooting.

### Plex Availability
LeMedia also maintains a Plex availability cache, scanning your Plex libraries and indexing movies, episodes, and seasons for fast in-app status checks. Plex availability runs alongside Jellyfin — you can use either or both.

Configuration is done in **Admin Settings → Media Servers**.

### Administration
- Settings management for all services
- User and permission management
- Request approval workflows
- Activity/audit logs and analytics
- Job scheduling and monitoring (with per-job run history)
- Share management for collaborative requests
- Upgrade finder for quality improvements
- Maintenance mode for planned downtime
- Dashboard slider customization
- Device management

## Requirements

- Docker and Docker Compose (Portainer deployment supported)
- PostgreSQL database (included in the compose file)
- Redis (included in the compose file, used for distributed rate limiting)
- TMDB API key (v3)
- OMDB API key (optional, for additional metadata)
- Sonarr instance with API key
- Radarr instance with API key
- Jellyfin server (optional, for library integration and availability tracking)
- Plex Media Server (optional, for library integration and availability tracking)
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
   - `TELEGRAM_BOT_TOKEN`: (optional) Telegram bot token for the interactive bot
   - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`: (optional) Your bot's username, e.g. `LeMedia2_bot`

   For **Log In with Telegram (OIDC)** setup, see:
   - `docs/TELEGRAM_LOGIN_SETUP.md`

3. Start the application:
   ```bash
   docker compose -f docker-compose.release.yml up -d
   ```

4. Access LeMedia at your configured URL (default: `http://localhost:3010`)

5. **First-time setup**: On first launch, you'll be guided through a setup wizard to create your administrator account

### Updating to a newer release

To pull the latest images and restart:

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

To pin a specific version instead of `latest`, set `LEMEDIA_RELEASE_TAG` in your `.env`:

```env
LEMEDIA_RELEASE_TAG=v1.2.3
```

### First-Time Setup

When you first start LeMedia with a fresh database, you'll be automatically redirected to the setup wizard at `/setup`. This wizard will:

1. Welcome you with an overview of LeMedia's features
2. Guide you through creating your first administrator account
3. Redirect you to the login page once complete

The setup wizard only appears once - after your admin account is created, it's disabled permanently.

### Faster restarts / less disk usage

- If you only changed runtime config in `.env` (URLs, API keys, DB string), you **do not need to pull again**:
  ```bash
  docker compose -f docker-compose.release.yml up -d
  ```

- To update to the newest release:
  ```bash
  docker compose -f docker-compose.release.yml pull
  docker compose -f docker-compose.release.yml up -d
  ```

If disk usage grows over time, it's usually unused old images:
```bash
docker image prune -af
```

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

- **Config changes only** (`.env` modifications): `docker compose -f docker-compose.release.yml up -d`
- **Pull latest release images**: `docker compose -f docker-compose.release.yml pull && docker compose -f docker-compose.release.yml up -d`
- **Build from local source** (maintainers): `docker compose up -d --build`

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

### Trakt Integration

Trakt lets users link their Trakt account to import their watchlist and viewing history.

1. Create a Trakt API app at [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications).
2. Set the redirect URI to: `https://your-domain.com/api/auth/trakt/callback`
3. Add credentials in **Admin Settings → 3rd Party** and enable Trakt.
4. Users link their account from **Settings → Profile → Linked Accounts**.

### Letterboxd Integration

Letterboxd reviews and star ratings can be automatically imported per-user.

Users link their Letterboxd username from **Settings → Profile → Linked Accounts**. Once linked, a background job periodically imports their public reviews (via Letterboxd's RSS feed) into LeMedia as reviews including star ratings.

### Google & GitHub OAuth (Sign-in + Linked Accounts)

LeMedia supports OAuth for Google and GitHub.

You can enable these by going to: `https://your-domain.com/admin/settings/3rd-party`

Enter your keys in the selection box and make sure you enable them, if they're not enabled the option will not show in the "Other Sign-in Methods" dropdown on the login page.

Provider callback URLs to register:
- Google: `https://your-domain.com/api/auth/oauth/google/callback`
- GitHub: `https://your-domain.com/api/auth/oauth/github/callback`
- Telegram: `https://your-domain.com/api/auth/oauth/telegram/callback`

Replace `https://your-domain.com` with your `APP_BASE_URL`.

How it works:
- Login page shows Google/GitHub/Telegram under "Other sign in methods".
- OAuth login only works for accounts that are already linked in **Linked Accounts**.
- Users must sign in normally first, then link providers from `Settings > Profile > Linked Accounts` (including Telegram).
- Linking/unlinking is protected by MFA re-auth in the app.

Notes:
- Apple OAuth is not required and is not configured by default.
- If Cloudflare Turnstile is configured, OAuth start is also protected by Turnstile verification.

### Multi-Factor Authentication

MFA can be enabled globally in Admin Settings > General. When enabled:
- New users will be prompted to set up TOTP on first login
- Existing users can manage MFA in their profile settings
- Admins can enforce MFA for all users or just administrators

## Telegram Bot

LeMedia includes an interactive Telegram bot that lets users request media, check their request status, track releases, and (for admins) manage services — all from Telegram.

### Features

| Command | Who | Description |
|---|---|---|
| `/link` | Everyone | Connect your LeMedia account to Telegram |
| `/unlink` | Everyone | Disconnect your account |
| `/request [title]` | Everyone | Search and request a movie or TV show |
| `/mystuff` | Everyone | View your recent requests and status |
| `/trending` | Everyone | Browse what's popular (movies or TV) |
| `/newstuff` | Everyone | See what was recently added to the library |
| `/follow [title]` | Everyone | Follow a show or movie for release notifications |
| `/following` | Everyone | View your followed media |
| `/release [title]` | Everyone | Theatrical/premiere and digital release dates |
| `/digitalrelease [title]` | Everyone | Digital release date for a title |
| `/nextepisode [title]` | Everyone | Next episode air date with countdown |
| `/watch [title]` | Everyone | Set a watch alert — get notified when media becomes available |
| `/alerts` | Everyone | View your active watch alerts |
| `/stopalerts` | Everyone | Remove all watch alerts |
| `/services` | Admins | Check health of all configured services |
| `/pending` | Admins | View pending requests with inline approve/deny buttons |
| `/help` | Everyone | Show all commands |

**Natural language also works** — just type freely:
- *"I want to watch Dune"* → searches and presents results
- *"Can I get Breaking Bad?"* → same
- *"Are my services running?"* → returns a plain-English health summary

**Push notifications** — when your request status changes (available, denied, downloading), the bot DMs you automatically. No extra setup needed once linked.

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token.

2. (Optional, recommended) Set a bot icon in BotFather using one of LeMedia's hosted logos.
   Use your public URL and one of these image URLs:
   - `${APP_BASE_URL}/icon-512.png`
   - `${APP_BASE_URL}/icon-1024.png`

   Example with a real domain:
   - `https://media.example.com/icon-512.png`

   Telegram requires this step to be done in BotFather (LeMedia cannot force it automatically).

3. Add to your `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=your-bot-token-here
   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBot_bot
   ```

4. Restart the application:
   ```bash
   docker compose -f docker-compose.release.yml up -d
   ```

5. Users connect from **Settings → Profile → Telegram Bot** in the web app — they'll get a one-time code to send to the bot via `/link`.

### Telegram Login (OIDC)

LeMedia also supports **Sign in with Telegram** through the new BotFather Web Login/OIDC flow.

1. Configure the OAuth app in BotFather (`/newapp`) and set:
   - Redirect URL: `https://your-domain.com/api/auth/oauth/telegram/callback`
   - Origin: `https://your-domain.com`
   - App icon URL (recommended): `${APP_BASE_URL}/icon-512.png`
2. Add credentials in Admin UI: **Admin Settings → Users & Auth → 3rd Party Sign-ins**.
3. Enable Telegram there so it appears under **Other sign-in methods** on the login page.

Before users can use **Continue with Telegram**, they must link Telegram from **Settings → Profile → Linked Accounts**.

For full step-by-step instructions, see [Telegram Login Setup](docs/TELEGRAM_LOGIN_SETUP.md).

### How linking works

1. User visits **Settings → Profile → Telegram Bot** and clicks **Link Telegram Account**
2. A one-time 8-character code is generated (valid for 10 minutes)
3. User sends `/link` to the bot and enters the code when prompted
4. The bot creates a personal API token scoped to that user and stores it securely
5. All subsequent bot commands act on behalf of that user with their permissions

Each user links independently — one bot serves all users.

---

### Episode Requests

LeMedia supports requesting specific episodes from TV shows. This works by:
1. Fetching TVDB ID from TMDB external IDs
2. Using Sonarr's `tvdb:<id>` series lookup capability
3. Allowing granular episode selection per season

### Authentication Flow

LeMedia supports multiple authentication methods:

1. **Local Auth**: Username/password stored in database with scrypt hashing
2. **Password Reset**: Forgot-password flow with time-limited single-use tokens
3. **MFA**: Optional TOTP verification after password
4. **WebAuthn**: Passwordless login with security keys/passkeys
5. **Google/GitHub OAuth**: Sign in with linked provider accounts
6. **Telegram OAuth**: Sign in via Telegram BotFather Web Login
7. **OIDC/SSO**: Redirect to external identity provider
8. **Jellyfin**: Authenticate against your Jellyfin server
9. **Header-based**: Trust headers from reverse proxy (Authelia/Authentik)

Session is maintained via secure HTTP-only cookies with configurable expiry.

### Database

LeMedia uses PostgreSQL for data persistence:
- User profiles, preferences, and social graph (friends, follows, blocks)
- Custom lists with items, reactions, and comments
- Reviews and review comments
- Taste profile and quiz data
- Request history, status, and comments
- Notification configurations and endpoints
- Approval workflows
- Analytics and audit logs
- Session management
- MFA secrets and WebAuthn credentials
- Jellyfin and Plex availability caches
- Telegram bot state and watch alerts
- Background job history
- Password reset tokens

Migrations run automatically on startup.

## Architecture

- **Frontend**: Next.js 16 with App Router and React 19
- **Backend**: Next.js API routes
- **Database**: PostgreSQL with automatic migrations
- **Cache / Rate Limiting**: Redis
- **Authentication**: Multi-method (local, password reset, MFA, WebAuthn, Google/GitHub OAuth, Telegram OAuth, OIDC, Jellyfin, headers)
- **Deployment**: Docker + Docker Compose
- **Media Services**: Sonarr, Radarr, Jellyfin, Plex
- **Metadata**: TMDB (primary), OMDB, Rotten Tomatoes
- **External Integrations**: Trakt, Letterboxd, Prowlarr, Telegram Bot

## API

LeMedia exposes a REST API at `/api/v1/*` for integration with other services. Authentication is required via session cookie or API token (passed as `Authorization: Bearer <token>` or the `x-api-key` header).

Key endpoints:
- `GET /api/v1/requests` — List requests
- `POST /api/v1/request/movie` — Request a movie
- `POST /api/v1/request/episode` — Request TV episodes
- `GET /api/v1/calendar` — Get calendar events
- `GET /api/health` — Health check endpoint

API tokens can be generated per-user in **Settings → Profile → API Tokens**.

## Support

For issues, feature requests, or contributions, please use the issue tracker on the project repository.

## License

See LICENSE file for details.
