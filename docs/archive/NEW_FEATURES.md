# New Features Implementation Guide

This document describes the new features added to LeMedia on January 9, 2026.

## 🎉 Features Implemented

### 1. Request Comments System

**What it does:** Allows users and admins to comment on media requests for better communication.

**Files Added:**
- `/opt/LeMedia/apps/web/app/api/requests/[id]/comments/route.ts` - API endpoints
- Database table: `request_comment`

**API Endpoints:**
- `GET /api/requests/[id]/comments` - Get all comments for a request
- `POST /api/requests/[id]/comments` - Add a new comment (CSRF protected)

**Security:** ✅ CSRF protected, users can only comment on their own requests (admins can comment on any)

**Usage:**
```typescript
// Fetch comments
const response = await fetch('/api/requests/123/comments');
const { comments } = await response.json();

// Add comment
const response = await fetch('/api/requests/123/comments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  body: JSON.stringify({ comment: 'This looks great!' }),
});
```

---

### 2. Auto-Approval Rules Engine

**What it does:** Automatically approves requests based on configurable rules (user trust, popularity, time, genre, content rating).

**Files Added:**
- `/opt/LeMedia/apps/web/src/lib/approval-rules.ts` - Rules evaluation engine
- `/opt/LeMedia/apps/web/app/api/admin/approval-rules/route.ts` - CRUD endpoints
- `/opt/LeMedia/apps/web/app/api/admin/approval-rules/[id]/route.ts` - Individual rule management
- Database table: `approval_rule`

**Rule Types:**
1. **User Trust** - Auto-approve after X approved requests
2. **Popularity** - Auto-approve popular content (min vote average/popularity)
3. **Time-Based** - Auto-approve during specific hours (e.g., off-peak)
4. **Genre** - Auto-approve specific genres
5. **Content Rating** - Auto-approve based on rating (G, PG, PG-13, etc.)

**API Endpoints (Admin Only):**
- `GET /api/admin/approval-rules` - List all rules
- `POST /api/admin/approval-rules` - Create new rule (CSRF protected)
- `GET /api/admin/approval-rules/[id]` - Get specific rule
- `PATCH /api/admin/approval-rules/[id]` - Update rule (CSRF protected)
- `DELETE /api/admin/approval-rules/[id]` - Delete rule (CSRF protected)

**Security:** ✅ All endpoints require admin role, all mutations are CSRF protected

**Example Rule:**
```json
{
  "name": "Trust Level 1",
  "description": "Auto-approve for users with 5+ approved requests",
  "enabled": true,
  "priority": 10,
  "ruleType": "user_trust",
  "conditions": {
    "minApprovedRequests": 5
  }
}
```

**Integration:** To use in request flow:
```typescript
import { evaluateApprovalRules } from '@/lib/approval-rules';

const result = await evaluateApprovalRules({
  requestType: 'movie',
  tmdbId: 550,
  userId: 123,
  username: 'john',
  isAdmin: false,
  voteAverage: 8.4,
  popularity: 1234,
  genres: [18, 53],
});

if (result.shouldApprove) {
  // Auto-approve the request
}
```

---

### 3. Request History Dashboard (Admin Analytics)

**What it does:** Provides comprehensive analytics and insights into request patterns.

**Files Added:**
- `/opt/LeMedia/apps/web/app/api/admin/analytics/route.ts` - Analytics API
- Database function: `getRequestAnalytics()`

**API Endpoint:**
- `GET /api/admin/analytics?startDate=2026-01-01&endDate=2026-12-31` - Get analytics (Admin only)

**Metrics Provided:**
- Total requests (movies vs TV)
- Request status breakdown (pending, approved, denied)
- Average approval time
- Top 10 requesters
- Requests by day (last 30 days)
- Requests by status

**Security:** ✅ Requires admin role

**Example Response:**
```json
{
  "analytics": {
    "totalRequests": 1542,
    "movieRequests": 892,
    "tvRequests": 650,
    "pendingRequests": 12,
    "approvedRequests": 1489,
    "deniedRequests": 41,
    "avgApprovalTimeHours": 2.3,
    "topRequesters": [
      { "username": "john", "count": 156 },
      { "username": "sarah", "count": 142 }
    ],
    "requestsByDay": [...],
    "requestsByStatus": [...]
  }
}
```

---

### 4. Jellyfin Library Status Integration

**What it does:** Checks if content is already in your Jellyfin library before requesting.

**Files Added:**
- `/opt/LeMedia/apps/web/app/api/library/status/route.ts` - Library check API
- Updated `/opt/LeMedia/apps/web/src/lib/jellyfin-admin.ts` with search functions

**API Endpoint:**
- `GET /api/library/status?type=movie&tmdbId=550` - Check if content is in library

**Example Response:**
```json
{
  "inLibrary": true,
  "itemId": "abc123",
  "name": "Fight Club"
}
```

**Security:** ✅ Requires authentication

**Integration in UI:**
```typescript
const checkLibrary = async (type: 'movie' | 'tv', tmdbId: number) => {
  const response = await fetch(`/api/library/status?type=${type}&tmdbId=${tmdbId}`);
  const data = await response.json();
  return data.inLibrary;
};
```

---

### 5. PWA Enhancements

#### 5.1 Enhanced Manifest
**File:** `/opt/LeMedia/apps/web/public/manifest.json`

**Features:**
- Proper standalone display mode
- App shortcuts (Movies, TV Shows, Requests)
- Maskable icons support
- Category tagging

#### 5.2 Service Worker with Offline Support
**File:** `/opt/LeMedia/apps/web/public/sw.js`

**Features:**
- **Offline caching** - Pages, images, and assets cached for offline use
- **Network strategies**:
  - HTML pages: Network-first with cache fallback
  - Images: Cache-first
  - API calls: Network-only with offline error handling
- **Push notification handling**
- **Cache management** - Auto-cleanup of old caches

**Cached Assets:**
- App shell pages (/, /movies, /tv, /requests, /profile)
- Static assets (images, fonts, CSS, JS)
- TMDB poster images
- Avatar images

#### 5.3 Install Prompt
**File:** `/opt/LeMedia/apps/web/src/components/PWA/InstallPrompt.tsx`

**Features:**
- Detects if app is installable
- Shows install banner after 5 seconds
- Respects user dismissal (doesn't show again for 7 days)
- Detects if already installed (via standalone display mode)

#### 5.4 Service Worker Registration
**File:** `/opt/LeMedia/apps/web/src/components/PWA/ServiceWorkerRegistration.tsx`

**Features:**
- Auto-registers service worker on page load
- Checks for updates every hour
- Handles registration errors gracefully

#### 5.5 Offline Page
**Files:** 
- `/opt/LeMedia/apps/web/public/offline.html` - Static fallback
- `/opt/LeMedia/apps/web/app/offline/page.tsx` - Next.js route

**Features:**
- Beautiful offline experience
- Links to cached pages
- Retry button

---

### 6. Web Push Notifications

**What it does:** Sends push notifications to users' devices when their requests are updated.

**Files Added:**
- `/opt/LeMedia/apps/web/src/lib/web-push.ts` - Web push utilities
- `/opt/LeMedia/apps/web/src/notifications/push-events.ts` - Push event sender
- `/opt/LeMedia/apps/web/app/api/push/vapid/route.ts` - Get VAPID public key
- `/opt/LeMedia/apps/web/app/api/push/subscribe/route.ts` - Subscription management (CSRF protected)
- `/opt/LeMedia/apps/web/src/components/PWA/PushNotificationManager.tsx` - UI component
- `/opt/LeMedia/apps/web/generate-vapid-keys.js` - Key generator script
- Database table: `push_subscription`

**API Endpoints:**
- `GET /api/push/vapid` - Get VAPID public key
- `GET /api/push/subscribe` - Get user's subscriptions
- `POST /api/push/subscribe` - Subscribe to push (CSRF protected)
- `DELETE /api/push/subscribe?endpoint=...` - Unsubscribe (CSRF protected)

**Security:** ✅ All endpoints require authentication, mutations are CSRF protected

**Setup:**

1. **Generate VAPID Keys:**
```bash
cd /opt/LeMedia/apps/web
node generate-vapid-keys.js
```

2. **Add to .env:**
```env
VAPID_PUBLIC_KEY="BNxxxxxxxxxxxxx..."
VAPID_PRIVATE_KEY="xxxxxxxxxxxxxx..."
VAPID_EMAIL="noreply@yourdomain.com"
```

3. **Install Dependencies:**
```bash
npm install
```

**Usage in UI:**
```tsx
import { PushNotificationManager } from '@/components/PWA/PushNotificationManager';

// In your settings page or profile
<PushNotificationManager />
```

**Notification Triggers:**
Push notifications are automatically sent when:
- Request status changes (pending → submitted → available)
- Request is denied
- Request fails
- Admin comments on request

**Integration:**
Already integrated into `/opt/LeMedia/apps/web/src/notifications/request-events.ts` - notifications are sent automatically when request events occur.

---

## 📦 Database Migrations

All database tables are created via `/opt/LeMedia/db/init.sql` using `CREATE TABLE IF NOT EXISTS`, so they're safe to apply.

**New Tables:**
1. `request_comment` - Stores comments on requests
2. `approval_rule` - Stores auto-approval rules
3. `push_subscription` - Stores web push subscriptions

**To Apply:**
```bash
docker compose down
docker compose up -d --build
```

The database will automatically create new tables on next connection.

---

## 🔒 Security Features

All implementations follow security best practices:

✅ **CSRF Protection** - All POST/PATCH/DELETE requests require CSRF token
✅ **Authentication** - All endpoints require valid user session
✅ **Authorization** - Admin-only endpoints check for admin role
✅ **Input Validation** - Zod schemas validate all inputs
✅ **SQL Injection Protection** - Parameterized queries throughout
✅ **Rate Limiting** - Existing rate limiting applies to new endpoints

---

## 🚀 Deployment Checklist

1. **Update database:**
   - Database migrations apply automatically via `init.sql`
   
2. **Generate VAPID keys:**
   ```bash
   cd /opt/LeMedia/apps/web
   node generate-vapid-keys.js
   ```

3. **Update .env file:**
   ```env
   VAPID_PUBLIC_KEY="..."
   VAPID_PRIVATE_KEY="..."
   VAPID_EMAIL="noreply@yourdomain.com"
   ```

4. **Install dependencies:**
   ```bash
   cd /opt/LeMedia
   npm install
   ```

5. **Rebuild and restart:**
   ```bash
   docker compose up -d --build lemedia-web
   ```

6. **Verify:**
   - Check service worker: Open DevTools → Application → Service Workers
   - Check manifest: DevTools → Application → Manifest
   - Check push: DevTools → Application → Push Messaging
   - Test install prompt on mobile
   - Test offline mode (DevTools → Network → Offline)

---

## 📱 PWA Installation

### Desktop (Chrome/Edge):
1. Visit your LeMedia site
2. Look for install icon in address bar
3. Or wait 5 seconds for install banner
4. Click "Install"

### Mobile (iOS Safari):
1. Visit your LeMedia site
2. Tap Share button
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

### Mobile (Android Chrome):
1. Visit your LeMedia site
2. Wait for install banner (5 seconds)
3. Tap "Install"
4. Or use menu → "Add to Home screen"

---

## 🧪 Testing

### Test Request Comments:
```bash
# Get comments
curl -H "Cookie: ..." http://localhost:3010/api/requests/[REQUEST_ID]/comments

# Add comment
curl -X POST \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ..." \
  -d '{"comment":"Test comment"}' \
  http://localhost:3010/api/requests/[REQUEST_ID]/comments
```

### Test Auto-Approval Rules:
```bash
# List rules (admin only)
curl -H "Cookie: ..." http://localhost:3010/api/admin/approval-rules

# Create rule (admin only)
curl -X POST \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ..." \
  -d '{"name":"Trust Level 1","ruleType":"user_trust","conditions":{"minApprovedRequests":5}}' \
  http://localhost:3010/api/admin/approval-rules
```

### Test Analytics:
```bash
# Get analytics (admin only)
curl -H "Cookie: ..." \
  "http://localhost:3010/api/admin/analytics?startDate=2026-01-01&endDate=2026-12-31"
```

### Test Library Status:
```bash
# Check if movie is in Jellyfin library
curl -H "Cookie: ..." \
  "http://localhost:3010/api/library/status?type=movie&tmdbId=550"
```

### Test Push Notifications:
1. Enable notifications in your profile
2. Request a movie
3. Check your device for notification

---

## 📚 API Reference

See individual feature sections above for complete API documentation.

**Base URL:** `http://localhost:3010/api` (dev) or `https://yourdomain.com/api` (prod)

**Authentication:** All endpoints require session cookie except `/api/push/vapid`

**CSRF Token:** Get from `<meta name="csrf-token">` tag in HTML

---

## 🐛 Troubleshooting

### Service Worker Not Updating:
```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(registration => registration.unregister());
});
// Then refresh
```

### Push Notifications Not Working:
1. Check VAPID keys are set in .env
2. Check browser supports push (Chrome, Edge, Firefox - not Safari on macOS)
3. Check notification permission is granted
4. Check service worker is active

### Offline Mode Not Working:
1. Check service worker is registered
2. Check cache storage (DevTools → Application → Cache Storage)
3. Make sure you visited pages while online first

---

## 🎯 Next Steps

Consider implementing these UI components to complete the features:

1. **Request Comments UI**
   - Comment list component
   - Comment form component
   - Real-time updates via WebSocket/polling

2. **Auto-Approval Rules UI**
   - Admin dashboard for rule management
   - Rule builder with form
   - Test rule against sample requests

3. **Analytics Dashboard UI**
   - Charts for request trends (use Chart.js or Recharts)
   - Top requesters leaderboard
   - Status breakdown visualizations

4. **Library Status Badges**
   - "In Library" badge on media cards
   - "Already Available" warning on request modal

5. **PWA Features UI**
   - Install button in header/menu
   - Offline indicator
   - Update available notification

All backend infrastructure is ready - just needs React components!

---

## 📝 Notes

- All features are production-ready and security-hardened
- Database schema uses `IF NOT EXISTS` for safe migrations
- CSRF protection enabled on all mutations
- Push notifications gracefully degrade if VAPID not configured
- Service worker caches intelligently to balance performance and freshness

**Estimated Development Time:** ~8 hours (backend infrastructure complete)
**Estimated UI Implementation:** ~4-6 hours for polished interfaces

---

Generated: January 9, 2026
