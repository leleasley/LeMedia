# Integration Guide for Remaining Features

## Quick Integration Steps

### 1. Add Recently Viewed Tracking to Media Pages

Find your movie detail page client component (likely `MovieDetailClient.tsx` or similar) and add:

```tsx
import { useTrackView } from "@/hooks/useTrackView";

// Inside the component:
export function MovieDetailClient({ movie }: { movie: any }) {
  // Add this hook at the top of your component
  useTrackView({
    mediaType: "movie",
    tmdbId: movie.id,
    title: movie.title,
    posterPath: movie.poster_path
  });

  // Rest of your component...
}
```

Do the same for TV detail pages:

```tsx
useTrackView({
  mediaType: "tv",
  tmdbId: show.id,
  title: show.name,
  posterPath: show.poster_path
});
```

**Files to update:**
- `apps/web/src/components/Movie/MovieDetailClient/index.tsx`
- `apps/web/src/components/Tv/TvDetailClient/index.tsx`
- Or wherever your media detail pages are

---

### 2. Update SearchHeader to Show Actor Results

Find `SearchHeader.tsx` and update the results rendering:

```tsx
// Add to the results mapping:
{results.map((result) => {
  // Existing movie/TV handling...
  
  // Add person/actor handling:
  if (result.media_type === 'person') {
    return (
      <Link
        key={result.id}
        href={`/person/${result.id}`}
        className="flex items-center gap-3 p-2 hover:bg-white/5 rounded"
      >
        {result.profile_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w200${result.profile_path}`}
            alt={result.name}
            width={40}
            height={60}
            className="rounded"
          />
        ) : (
          <div className="w-10 h-15 bg-gray-700 rounded flex items-center justify-center">
            <User className="w-5 h-5 text-gray-400" />
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-white">{result.name}</p>
          <p className="text-xs text-gray-400">
            {result.known_for_department || 'Actor'}
          </p>
        </div>
      </Link>
    );
  }
  
  // Existing return for movie/TV...
})}
```

---

### 3. Enable Recently Viewed by Default (Optional)

If you want it enabled by default for new users, change in `dashboard-sliders.ts`:

```tsx
{ type: DashboardSliderType.RECENTLY_VIEWED, enabled: true, isBuiltIn: true, order: 5 },
```

---

### 4. Test Notifications

After deployment, test the notification system:

1. Request a movie as a regular user
2. Approve it as admin
3. Check the bell icon - should show notification
4. Click notification - should go to request or media page
5. Click "Mark as read" - notification should disappear from unread

---

### 5. Add Download Progress to Requests Page (TODO)

Find the requests list component and add download progress indicators:

```tsx
// In your request card component:
import { DownloadProgressBar } from "@/components/Media/DownloadProgress";

// In the render:
{request.status === 'downloading' && (
  <DownloadProgressBar requestId={request.id} />
)}
```

You may need to create a simpler version of the download progress component that works in a list view.

---

## Testing Checklist

### Mobile Navigation
- [ ] Open on mobile device/emulator
- [ ] Verify 4 bottom tabs (Home, Movies, Series, Search)
- [ ] Tap "More" button
- [ ] Verify categories are organized
- [ ] Verify Profile link works

### Notifications
- [ ] Click bell icon - dropdown appears
- [ ] Request content - notification appears when approved
- [ ] Click notification - goes to correct page
- [ ] Mark as read works
- [ ] Mark all as read works
- [ ] Unread count updates correctly

### Recently Viewed
- [ ] Enable in dashboard customization
- [ ] Visit 3-4 different movies/shows
- [ ] Return to dashboard
- [ ] Verify "Recently Viewed" carousel appears
- [ ] Verify most recent items show first
- [ ] Click item - goes to correct page

### Search
- [ ] Search for "Tom Hanks"
- [ ] Backend returns person results (check Network tab)
- [ ] Frontend shows results (after SearchHeader update)
- [ ] Click actor - goes to person page

---

## Common Issues & Fixes

### Recently Viewed Not Showing
- Check if slider is enabled in user settings
- Check browser console for API errors
- Verify database table was created

### Notifications Not Working
- Check browser console for errors
- Verify NotificationBell is in the header
- Test API endpoint directly: `GET /api/notifications/unread`

### Mobile Nav Issues
- Clear browser cache
- Rebuild app: `docker compose up -d --build`
- Check for JavaScript errors in console

---

## Performance Tips

1. **Recently Viewed:** Limit to 20 items (already configured)
2. **Notifications:** Poll every 30 seconds (already configured)
3. **View Tracking:** 2-second delay before tracking (already configured)

---

## Future Enhancements

Consider adding later:
- Notification preferences (email, push, in-app toggles)
- Recently viewed sections (This Week, Last Month)
- Search filters (actors only, directors only)
- Download progress on request list page
- Notification categories/filtering
- Export viewing history

---

That's it! The backend is ready. Just integrate the React components and test thoroughly.
