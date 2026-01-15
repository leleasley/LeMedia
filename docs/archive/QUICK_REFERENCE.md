# Quick Reference Card 🚀

## Deployment
```bash
cd /opt/LeMedia
docker compose down && docker compose up -d --build
```

## What's New

### 1. Mobile Nav
- 4 tabs: Home, Movies, Series, **Search** (NEW)
- More menu: reorganized & includes Profile

### 2. Notifications
- Bell icon: real notification center
- Auto-notifies on request status changes
- Clickable, with read/unread tracking

### 3. Recently Viewed
- Dashboard slider (disabled by default)
- Enable in settings to track viewing history
- Shows last 20 viewed items

### 4. Actor Search
- Backend ready for person/actor search
- API: `/api/tmdb/search?type=person`
- Frontend needs SearchHeader update

## Quick Integration

### Track Views in Media Pages
```tsx
import { useTrackView } from "@/hooks/useTrackView";

useTrackView({
  mediaType: "movie",
  tmdbId: movie.id,
  title: movie.title,
  posterPath: movie.poster_path
});
```

### Enable Recently Viewed
1. Dashboard customization
2. Find "Recently Viewed" slider
3. Toggle enabled

### Send Custom Notification
```typescript
import { sendUserNotification } from "@/lib/notification-helper";

await sendUserNotification({
  userId: 123,
  type: "system",
  title: "Welcome!",
  message: "Enjoy your new features",
  link: "/profile"
});
```

## Database Tables

```sql
user_notification   -- In-app notifications
recently_viewed     -- Viewing history
```

## API Endpoints

```
GET  /api/notifications/unread
POST /api/notifications/{id}/read
POST /api/notifications/read-all

GET  /api/recently-viewed
POST /api/recently-viewed
DELETE /api/recently-viewed

GET /api/tmdb/search?type=person
```

## Files to Update

For full integration:
1. `MovieDetailClient.tsx` - Add useTrackView hook
2. `TvDetailClient.tsx` - Add useTrackView hook
3. `SearchHeader.tsx` - Display actor results

## Test It

1. **Mobile:** Open on phone, check bottom nav
2. **Notifications:** Request → Approve → Check bell
3. **Recently Viewed:** Enable slider, visit media, check dashboard
4. **Search:** Search "Tom Hanks", check Network tab

## Troubleshooting

### Tables not created?
```bash
docker compose logs lemedia-web | grep CREATE
```

### Notifications not showing?
```bash
curl -H "Cookie: ..." http://localhost:3010/api/notifications/unread
```

### Recently viewed not tracking?
- Check browser console
- Verify useTrackView hook is called
- Wait 2 seconds on page

## Status

✅ Mobile nav (done)  
✅ Notifications (done)  
✅ Recently viewed (done - needs hook integration)  
⚠️ Actor search (done - needs frontend)  
❌ Download progress on requests (not started)

**Overall: 80% Complete**

## Documentation

- `FEATURE_ENHANCEMENTS.md` - Full technical docs
- `INTEGRATION_GUIDE.md` - Integration steps
- `FINAL_SUMMARY.md` - Complete summary

---

*Questions? Check the full docs or logs!* 🎬
