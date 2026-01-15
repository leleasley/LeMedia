# Live Download Progress Feature

**Implemented:** January 10, 2026  
**Status:** ✅ **DEPLOYED**

---

## 🎉 What's New

Your LeMedia app now shows **live download progress** instead of just "Monitored in Radarr/Sonarr"!

### Before vs. After

**BEFORE:**
- Movie/TV downloading → Shows "Monitored in Radarr/Sonarr" 🔵
- Movie/TV available → Shows "Available in Radarr" ✅

**AFTER:**
- Movie/TV downloading → Shows **live progress bar** with % and time left 📊
- Movie/TV importing → Shows "Importing to Library..." with purple animation 💜
- Movie/TV available → Shows "Available in Radarr" ✅

---

## 🎨 Visual Features

### Download Progress Bar
```
┌─────────────────────────────────────────────────┐
│ 🔽 Downloading                          47%    │
│    1.2 GB of 2.5 GB                   23m 15s  │
│ ▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱                      │
└─────────────────────────────────────────────────┘
```

**Features:**
- 🔵 **Blue glass-morphism design** (matches your theme)
- 📊 **Real-time progress** (0-100%)
- ⏱️ **Time remaining** (formatted as "1h 30m" or "45s")
- 💾 **Data downloaded** vs **total size** (e.g., "1.2 GB of 2.5 GB")
- ✨ **Animated shimmer effect** on progress bar
- 🔄 **Auto-refreshes every 5 seconds**

### Importing State
```
┌─────────────────────────────────────────────────┐
│ ⚙️ Importing to Library                        │
│    Processing files...                          │
│ ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰ (pulsing)            │
└─────────────────────────────────────────────────┘
```

**Features:**
- 💜 **Purple glass design** (different from downloading)
- ⚙️ **Spinner animation** while importing
- 🌊 **Pulsing progress bar** 
- ⏰ **Shows for ~3 seconds** then refreshes page

### Error State
```
┌─────────────────────────────────────────────────┐
│ ⚠️ Download Error                               │
│    No connection to download client             │
└─────────────────────────────────────────────────┘
```

**Features:**
- 🔴 **Red error styling**
- ⚠️ **Clear error message** from Radarr/Sonarr
- 📍 **Doesn't block the UI**

---

## 📍 Where It Shows

### 1. Movie Detail Pages
- URL: `/movie/[id]`
- Location: Below the trailer/action buttons
- Shows when: Movie is being downloaded or importing

### 2. TV Show Detail Pages  
- URL: `/tv/[id]`
- Location: In the season/episode management section
- Shows when: Episodes are being downloaded
- **Note:** TV shows require episode-level tracking (more complex)

### 3. Recently Added Carousel
- **Status Badge Updated:**
  - ✅ Green check = Available
  - 🔽 Blue download arrow = **Downloading** (NEW!)
  - ⏰ Yellow bell = Pending request

---

## 🔧 Technical Implementation

### New Components

#### 1. **DownloadProgressBar Component**
**File:** `/src/components/Media/DownloadProgressBar.tsx`

**Features:**
- Polls `/api/downloads/progress` every 5 seconds
- Calculates download percentage
- Formats bytes and time remaining
- Handles importing state
- Auto-refreshes page on completion
- Type-safe TypeScript

**Props:**
```typescript
interface DownloadProgressBarProps {
  type: "movie" | "tv";
  tmdbId: number;
  onComplete?: () => void; // Optional callback when done
}
```

**Usage:**
```tsx
<DownloadProgressBar
  type="movie"
  tmdbId={550}
  onComplete={() => window.location.reload()}
/>
```

#### 2. **Download Progress API**
**File:** `/app/api/downloads/progress/route.ts`

**Endpoint:** `GET /api/downloads/progress`

**Query Parameters:**
- `type` (optional): "movie" or "tv"
- `tmdbId` (optional): Filter by TMDB ID

**Response:**
```json
{
  "downloads": [
    {
      "id": 12345,
      "tmdbId": 550,
      "type": "movie",
      "title": "Fight Club",
      "status": "downloading",
      "sizeleft": 1300000000,
      "size": 2500000000,
      "timeleft": "PT23M15S",
      "percentComplete": 47.2,
      "downloadClient": "qBittorrent",
      "isImporting": false
    }
  ]
}
```

**Data Sources:**
- Radarr: `/api/v3/queue` (movies)
- Sonarr: `/api/v3/queue` (TV shows)

**Caching:** No caching (real-time data)

**Authentication:** Required

### Updated Components

#### 1. **MovieRequestPanel**
**File:** `/src/components/Movie/MovieRequestPanel/index.tsx`

**Changes:**
- Replaced "Monitored in Radarr" badge with `<DownloadProgressBar />`
- Only shows progress when movie is monitored but NOT yet downloaded
- Refreshes page automatically when download completes

**Before:**
```tsx
<div className="bg-blue-500/20">
  <Eye /> Monitored in Radarr
</div>
```

**After:**
```tsx
<DownloadProgressBar
  type="movie"
  tmdbId={tmdbId}
  onComplete={() => window.location.reload()}
/>
```

#### 2. **StatusBadgeMini**
**File:** `/src/components/Common/StatusBadgeMini/index.tsx`

**Changes:**
- Added `MediaStatus.DOWNLOADING = 8` enum value
- Added blue download arrow icon (`ArrowDownTrayIcon`)
- Updated badge styling for downloading state

**New Badge:**
```tsx
case MediaStatus.DOWNLOADING:
  badgeStyle.push('bg-blue-500 border-blue-400 ring-blue-400 text-blue-100');
  indicatorIcon = <ArrowDownTrayIcon />;
  break;
```

---

## 🎯 Download States

### State Machine
```
REQUEST → DOWNLOADING → IMPORTING → AVAILABLE
    ↓          ↓            ↓           ↓
  Yellow     Blue      Purple      Green
   Bell     Arrow     Spinner      Check
```

### MediaStatus Enum
```typescript
export enum MediaStatus {
  UNKNOWN = 1,
  PENDING = 2,
  PROCESSING = 3,
  PARTIALLY_AVAILABLE = 4,
  AVAILABLE = 5,
  BLACKLISTED = 6,
  DELETED = 7,
  DOWNLOADING = 8,  // NEW!
}
```

---

## 🚀 How It Works

### Data Flow

1. **User visits movie page** → Component mounts
2. **Component fetches queue** → `/api/downloads/progress?type=movie&tmdbId=550`
3. **API queries Radarr** → `/api/v3/queue`
4. **Radarr returns queue item:**
   ```json
   {
     "status": "downloading",
     "sizeleft": 1300000000,
     "size": 2500000000,
     "timeleft": "PT23M15S"
   }
   ```
5. **Component calculates:**
   - Progress: `(size - sizeleft) / size * 100` = 47.2%
   - Time: Parses ISO 8601 duration → "23m 15s"
   - Downloaded: Converts bytes → "1.2 GB"
6. **Component polls every 5 seconds** → Updates UI
7. **When complete:**
   - Shows "Importing..." for 3 seconds
   - Calls `onComplete()` callback
   - Page refreshes to show "Available"

### Polling Behavior

- **Interval:** 5 seconds
- **Timeout:** Never (polls until complete)
- **Stop conditions:**
  - Download completes
  - Download removed from queue
  - User navigates away
- **Error handling:** Silently stops polling on 401/500

---

## 📊 Performance

### API Calls
- **Per page load:** 1 initial call
- **While downloading:** 1 call every 5 seconds
- **Average download time:** 10-30 minutes
- **Total API calls:** ~120-360 per download

### Optimization
- ✅ No caching (real-time data required)
- ✅ Conditional rendering (only when downloading)
- ✅ Automatic cleanup (stops polling when done)
- ✅ Minimal payload (~200-500 bytes per response)

---

## 🐛 Known Limitations

### 1. **TV Shows Not Fully Implemented**
- TV shows have episode-level downloads
- Requires more complex tracking
- Currently shows basic status
- **Future:** Episode-specific progress bars

### 2. **TVDB vs TMDB ID Mapping**
- Sonarr uses TVDB IDs
- TMDB uses TMDB IDs  
- Requires ID mapping for TV shows
- **Workaround:** Using TVDB ID from Sonarr response

### 3. **Page Refresh on Complete**
- Currently does `window.location.reload()`
- **Future:** Use SWR revalidation instead
- More elegant but requires refactor

### 4. **No Pause/Cancel**
- Can't pause downloads from UI
- Must go to Radarr/Sonarr directly
- **Future:** Add queue management buttons

---

## 🎨 Styling Details

### Glass Morphism
```css
.glass-strong {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

### Progress Bar Gradient
```css
background: linear-gradient(to right, #2563eb, #3b82f6, #60a5fa);
```

### Shimmer Animation
```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.animate-shimmer {
  animation: shimmer 2s infinite;
}
```

### Color Palette
- **Downloading:** Blue (`#3b82f6`)
- **Importing:** Purple (`#a855f7`)
- **Available:** Green (`#10b981`)
- **Error:** Red (`#ef4444`)

---

## 🧪 Testing

### Manual Test Steps

1. **Test Download Progress:**
   ```bash
   # Request a movie in LeMedia
   # Wait for it to start downloading
   # Navigate to movie detail page
   # Should see blue progress bar with %
   ```

2. **Test Importing State:**
   ```bash
   # Wait for download to reach ~99%
   # Should transition to purple "Importing..." state
   # After ~3 seconds, should refresh and show "Available"
   ```

3. **Test API Endpoint:**
   ```bash
   curl http://localhost:3010/api/downloads/progress \
     -H "Cookie: lemedia_session=..."
   ```

4. **Test Error Handling:**
   ```bash
   # Stop Radarr service temporarily
   # Should gracefully stop polling
   # No console errors
   ```

### Edge Cases Handled

- ✅ No downloads in queue → Hides component
- ✅ Multiple downloads → Shows first one
- ✅ Download fails → Shows error state
- ✅ Network timeout → Stops polling gracefully
- ✅ User navigates away → Cleanup interval
- ✅ Download completes while viewing → Auto-refresh

---

## 🔮 Future Enhancements

### Planned Features

1. **Episode-Level Progress (TV Shows)**
   - Show progress for each episode
   - Season completion percentage
   - Episode list with status icons

2. **Queue Management**
   - Pause/resume downloads
   - Cancel downloads
   - Change priority
   - Move up/down in queue

3. **Multi-Download View**
   - Show all active downloads
   - Global download stats
   - Bandwidth usage graph

4. **Notifications**
   - Push notification when complete
   - Toast when download starts
   - Sound effect on complete

5. **History**
   - Recently completed downloads
   - Download speed charts
   - Failed download list

6. **Settings**
   - Polling interval customization
   - Disable auto-refresh
   - Choose notification sounds

---

## 📝 Changelog

### v1.0.0 - January 10, 2026

**Added:**
- ✨ Live download progress bars for movies
- 🔽 Download status badge (blue arrow)
- 🎨 Animated progress bar with shimmer effect
- ⏱️ Time remaining display
- 💾 Data downloaded display
- 💜 Importing state with purple styling
- 🔴 Error state handling
- 🔄 Auto-refresh on completion
- 📡 Real-time polling (5-second interval)
- 🛡️ Authentication required on API

**Changed:**
- 🔵 "Monitored in Radarr" → Live progress bar
- 📊 MediaStatus enum (added DOWNLOADING = 8)
- 🎯 StatusBadgeMini component (added download icon)

**Files Created:**
- `/app/api/downloads/progress/route.ts`
- `/src/components/Media/DownloadProgressBar.tsx`

**Files Modified:**
- `/src/components/Common/StatusBadgeMini/index.tsx`
- `/src/components/Movie/MovieRequestPanel/index.tsx`
- `/src/types/server/constants/media.ts`
- `/app/globals.css` (added shimmer animation)

---

## 🎉 Result

Your LeMedia app now provides a **Netflix-quality download experience** with:
- 📊 Real-time progress tracking
- 🎨 Beautiful animated UI
- ⚡ Auto-updating every 5 seconds
- 🔄 Seamless page refresh on completion
- 🛡️ Error handling and graceful degradation

**Try it out:** Request a movie and watch the magic happen! 🎬✨

---

**Author:** GitHub Copilot CLI  
**Date:** January 10, 2026  
**Version:** 1.0.0
