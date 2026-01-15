# LeMedia Development Guide

## Quick Commands

### Rebuild the Web Application

```bash
docker compose up -d --build lemedia-web
```

This command will:
- Rebuild the Docker image for the web application
- Restart the container with the new build
- Run in detached mode (background)

### Other Useful Commands

```bash
# View logs
docker compose logs -f lemedia-web

# Restart without rebuilding
docker compose restart lemedia-web

# Stop all services
docker compose down

# Start all services
docker compose up -d

# View running containers
docker compose ps

# Access the container shell
docker compose exec lemedia-web sh
```

## Development Workflow

### Making Changes with Claude Code

1. **Make changes** - Work with Claude Code to modify/add code
2. **Test locally** - Rebuild and test: `docker compose up -d --build lemedia-web`
3. **Check logs** - Verify no errors: `docker compose logs -f lemedia-web`
4. **Test in browser** - Ensure changes work as expected

### Pushing Changes to Git

Once you're happy with your changes, push them to Gitea:

1. **Check what changed**:
   ```bash
   git status
   ```

2. **Stage your changes**:
   ```bash
   git add .                    # Add all changes
   # or
   git add path/to/file.ts      # Add specific files
   ```

3. **Commit with a descriptive message**:
   ```bash
   git commit -m "$(cat <<'EOF'
   Brief description of what you changed

   - Bullet point details
   - More details
   - Any relevant context

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   EOF
   )"
   ```

4. **Push to Gitea**:
   ```bash
   git push
   ```

### What Happens After Push

When you push to Gitea:

1. **Gitea Actions triggers** - CI/CD pipeline starts automatically
2. **Docker image builds** - Fresh build with your changes
3. **Build logs available** - Check at `http://10.77.77.250:3000` → Actions tab
4. **Build result** - ✅ Success or ❌ Failure with error logs

You can watch the build progress in real-time in the Gitea web UI under the "Actions" tab.

### Quick Git Commands

```bash
# View commit history
git log --oneline -10

# View changes before committing
git diff

# Undo uncommitted changes
git restore path/to/file.ts

# View remote info
git remote -v

# Pull latest changes (if working across machines)
git pull origin main
```

## Recent Changes

### ServiceWorker & Notifications Fix (2026-01-12)

#### Database Fix:
- **User Notification Table**: Created missing `user_notification` table in the database
  - Fixed HTTP 500 error on `/api/notifications/unread` endpoint
  - Table includes user_id, type, title, message, link, is_read, metadata, and created_at fields
  - Proper indexes for performance: user_id + is_read + created_at, and created_at DESC

#### ServiceWorker SSE Streaming Fix:
- **EventSource Compatibility**: Updated `public/sw.js` to bypass Server-Sent Events (SSE) streams
  - Fixed "ServiceWorker encountered an unexpected error" on `/api/v1/stream/admin-counts`
  - SSE streams at `/api/v1/stream/*` now bypass ServiceWorker completely
  - Added documentation explaining why EventSource connections cannot be cached/proxied
  - **Important**: After deploying SW changes, users must hard refresh (Ctrl+Shift+R / Cmd+Shift+R) to update the ServiceWorker

### Notification UI & Security Enhancements (2026-01-09)

#### UI Improvements:
- **Responsive Notification Tabs**: Redesigned the notification settings tabs (`/admin/settings/notifications/*`) from a horizontal scroll to a responsive grid.
  - Improves usability on mobile devices by displaying tabs in 2 columns (mobile) or 3 columns (tablet).
  - Centered tab content for a cleaner, modern look.

#### Security Enhancements:
- **Database-Backed User Verification**: Updated the core authentication logic in `auth.ts` to verify users against the database on every request.
  - Enables immediate session revocation if a user is deleted or banned.
  - Ensures permission changes (like admin status) take effect within 60 seconds without requiring a re-login.
  - Implemented an LRU cache (TTL: 60s) to maintain high performance while improving security.

- **User Banning System**: Added the ability to ban/unban users from the Admin Users page.
  - **Database**: Added `banned` column to `app_user` table.
  - **Enforcement**: Banned users are blocked from logging in via Password, OIDC, or Passkey.
  - **Session**: Existing sessions for banned users are revoked within 60 seconds via the database-backed user verification.
  - **UI**: Added visual "Banned" badge and "Ban/Unban" button in `/admin/users`.

### Profile Page Enhancement (2026-01-05)

Implemented a Jellyseerr-style profile page with the following features:

#### New Components Created:
- **ImageFader** (`src/components/Common/ImageFader/`) - Background image carousel with fade transitions
- **ProgressCircle** (`src/components/Common/ProgressCircle/`) - Circular progress indicator with heat-level colors
- **ProfileHeader** (`src/components/Profile/ProfileHeader/`) - User profile header with avatar and metadata
- **RequestCard** (`src/components/Profile/RequestCard/`) - Request display cards with status indicators
- **ProfilePageClient** (`src/components/Profile/ProfilePageClient/`) - Main profile page client component

#### New API Endpoints:
- `GET /api/profile/stats` - Fetch user request statistics
- `GET /api/profile/requests?limit=10` - Fetch recent requests with TMDB data enrichment

#### Database Updates:
- Added `getUserRequestStats()` function to aggregate user request metrics

#### Features:
- **Dynamic Background**: Flickering background using backdrop images from requested media
- **Request Quotas**: Visual display of movie/series request limits with progress circles
- **Recent Requests**: Grid display of recent requests with images and status badges
- **MFA Status**: Two-factor authentication status display
- **Notification Channels**: Display of assigned notification endpoints (admin-only configuration)
- **Stats Cards**: Total requests, movie requests, and series requests with quota tracking

#### Page Routes:
- `/profile` - New user profile page (Jellyseerr-style)
- `/settings/profile` - Existing profile settings page (retained)

#### Design Features:
- Backdrop images fade through every 6 seconds
- Heat-level colored progress circles (green → yellow → red)
- Request status badges with color coding
- Responsive grid layout for request cards
- Glass morphism effects with backdrop blur
- Smooth transitions and hover effects

## Project Structure

```
apps/web/
├── app/
│   ├── (app)/
│   │   ├── profile/           # New: Jellyseerr-style profile page
│   │   └── (settings)/
│   │       └── settings/
│   │           └── profile/   # Existing: Settings page
│   └── api/
│       └── profile/
│           ├── stats/         # New: User stats endpoint
│           └── requests/      # New: Recent requests endpoint
├── src/
│   ├── components/
│   │   ├── Common/
│   │   │   ├── ImageFader/    # New: Background fader
│   │   │   └── ProgressCircle/ # New: Circular progress
│   │   └── Profile/
│   │       ├── ProfileHeader/  # New: Profile header
│   │       ├── ProfilePageClient/ # New: Main profile component
│   │       └── RequestCard/    # New: Request card
│   └── db.ts                   # Updated: Added getUserRequestStats
└── ...
```

## Environment Variables

Make sure these are set in your `.env` file:

```bash
DATABASE_URL=postgresql://...
TMDB_API_KEY=your_tmdb_api_key_here
```

## Troubleshooting

### Build Errors
If you encounter build errors:
1. Check the logs: `docker compose logs -f lemedia-web`
2. Clear the build cache: `docker compose build --no-cache lemedia-web`
3. Remove old containers: `docker compose down && docker compose up -d --build`

### TypeScript Errors
- Ensure all imports are correct
- Check for missing dependencies in `package.json`
- Run type checking locally: `npm run type-check` (if available)

### Database Connection Issues
- Verify `DATABASE_URL` is set correctly
- Check if the database container is running: `docker compose ps`
- Restart the database: `docker compose restart db`

## Architecture Notes

### Profile Page Design Philosophy
The profile page follows Jellyseerr's design patterns:
- **Visual-First**: Large backdrop images create an immersive experience
- **Data Hierarchy**: Most important stats (quotas) prominently displayed
- **Progressive Disclosure**: Details available through links and interactions
- **Status Awareness**: Clear visual indicators for request states and limits
- **Admin Context**: Different views for admins vs regular users

### Quota System
Currently uses mock quotas (50 movies, 30 series). To implement real quotas:
1. Add quota columns to `app_user` table
2. Update `getUserRequestStats()` to include quota data
3. Implement quota enforcement in request creation logic
4. Add admin interface for setting user quotas

### TMDB Integration
- API responses are cached for 1 hour
- Cache automatically cleaned when it exceeds 1000 entries
- Fallback handling if TMDB API is unavailable
- Uses `/imageproxy/tmdb/` for image optimization