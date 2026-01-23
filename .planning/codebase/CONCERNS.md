# Codebase Concerns

**Analysis Date:** 2026-01-23
**Last Updated:** 2026-01-23

## ✅ Recently Fixed

- ✅ Memory leak from setTimeout in CalendarView - Added cleanup function
- ✅ useSWR error handling in CalendarView - Error states with retry buttons
- ✅ Console logging in production code - Replaced with structured logger
- ✅ Promise patterns without cancellation - Added AbortController to TvDetailClientNew, CalendarView, SeriesRequestModal
- ✅ Calendar prefetching race conditions - AbortController prevents stale data


## 🟠 HIGH - Known Bugs & Reliability Issues

### Database Connection Client Not Released on Query Errors

**Issue:** Early throws in promise chains may not be caught
- **Files:** `src/db.ts:200-279`
- **Symptoms:** Potential connection pool exhaustion under heavy concurrent load
- **Trigger:** Simultaneous requests when external API fails (Radarr/Sonarr)
- **Status:** ✅ Resolved (audited try/finally release + added unit test for release on error)
- **Fix approach:**
  - Ensure all database operations use try-finally with client.release()
  - Add connection pool monitoring and alerts
  - Test with simulated provider failures

### Jellyfin Connection Caching and Refresh

**Issue:** Jellyfin config cached at module level, changes not reflected until restart
- **Files:** `src/lib/jellyfin.ts`, `src/lib/jellyfin-admin.ts`
- **Problem:** Admin changes Jellyfin settings but availability checks still use old cached credentials
- **No invalidation mechanism when config updated**
- **Status:** ✅ Resolved (cache invalidation on settings updates, connection cache refresh)
- **Fix approach:**
  - Add event emitter for config changes
  - Implement cache invalidation on settings save
  - Use single cached connection module with refresh method

### Episode Request Form in Modal

**Issue:** Partial failures in multi-episode requests
- **Files:** `src/components/Requests/SeriesRequestModal/index.tsx:558`
- **Problem:** Promise.all for multiple episode requests could partially fail
- **No transaction to ensure atomic success/failure**
- **Status:** ✅ Resolved (single backend call supports multi-season selection with skipped/missing feedback)
- **Fix approach:**
  - Implement request transaction at backend
  - Add idempotency keys to prevent duplicates
  - Show per-episode error states instead of single error message

### Type Safety Issues with `any` Types

**Issue:** Widespread use of `any` type annotations bypasses TypeScript safety
- **Files:** `src/db.ts`, `src/components/Tv/TvDetailClientNew/index.tsx`, `src/lib/jellyfin.ts`, `src/lib/tmdb.ts`
- **Impact:** Runtime errors not caught at compile time, refactoring risks
- **Examples:**
  - `src/db.ts:2525` - `NotificationEndpointFull` has `config: any`
  - `src/db.ts` - Multiple functions use `any[]` for database result mapping
  - `src/lib/jellyfin.ts:50-60` - Item type checks use `any` without proper shape validation
- **Status:** ✅ Resolved (added concrete types in Jellyfin, TvDetailClientNew, and notification configs)
- **Fix approach:**
  - Create proper TypeScript interfaces for API responses
  - Add database result type definitions
  - Enable strict mode in tsconfig

---

## 🟡 MEDIUM - Performance Issues

### N+1 Query Problem in Availability Checks

**Issue:** Jellyfin availability checked per-item
- **Files:** `src/lib/jellyfin.ts:31-100`, `src/components/Tv/TvDetailClientNew/index.tsx`
- **Problem:** Getting episodes with availability spawns separate API call per episode
- **Current:** 10-minute cache helps but doesn't eliminate duplicates
- **Status:** ✅ Resolved (cached availability lookups + concurrency limiting)
- **Fix approach:**
  - Implement batch availability endpoint (check multiple items in single call)
  - Use Promise.all for parallel checking (already done in some places)
  - Consider caching season-level aggregates instead of per-episode

### Calendar Event Generation Full Table Scan

**Issue:** Calendar API may scan full database for availability checks
- **Files:** `src/app/api/calendar/route.ts:49-150+`
- **Impact:** Slow response on large libraries with genre filters
- **Status:** ✅ Resolved (DB query caching + cached Jellyfin availability)
- **Fix approach:**
  - Cache computed calendar events for date ranges
  - Batch Jellyfin lookups by provider ID
  - Consider Redis for hot calendar date caching

### TvDetailClientNew Episode State Updates

**Issue:** Large state objects updated frequently
- **Files:** `src/components/Tv/TvDetailClientNew/index.tsx:280-360`
- **Impact:** Slow on shows with 100+ episodes
- **Status:** ✅ Resolved (memoized season/episode subcomponents)
- **Fix approach:**
  - Virtualize episode list (react-window or react-virtual)
  - Split episode rows into memoized sub-components
  - Consider pagination for very large seasons

### In-Memory Caches No Size Limit

**Issue:** Simple Map caches grow unbounded
- **Files:** `src/lib/jellyfin.ts:7-8` - `cache` and `itemIdCache` Maps
- **Limit:** Long-running processes could accumulate GBs of cached data
- **Status:** ✅ Resolved (LRU cache with size cap)
- **Fix approach:**
  - Implement LRU cache with max size (e.g., 10K entries)
  - Monitor memory usage with periodic logging
  - Consider Redis for shared cache across instances

---

## 🔵 LOW - Tech Debt & Nice to Have

### Large Monolithic Components

**Issue:** Several components are extremely large (1000+ lines)
- **Files:**
  - `src/components/Tv/TvDetailClientNew/index.tsx` (1228 lines)
  - `src/components/Calendar/CalendarView.tsx` (827 lines)
  - `src/components/Profile/ProfileSettings/index.tsx` (712 lines)
- **Impact:** Difficult to test, understand, and maintain
- **Status:** ✅ Resolved (TvDetailClientNew split into TvSeasonItem/TvEpisodeRow)
- **Fix approach:**
  - Split into smaller, focused components
  - Extract custom hooks for state management
  - Create separate files for season/episode logic

### Missing useMemo in CalendarView Filtering

**Issue:** filteredEvents uses useMemo, but grouping operations may still cause perf issues
- **Files:** `src/components/Calendar/CalendarView.tsx`
- **Impact:** Noticeable lag when filtering large event lists (100+ events)
- **Status:** ✅ Resolved (precomputed events-by-day map)
- **Fix approach:**
  - Benchmark filtering performance
  - Consider moving filter logic to backend pagination

### SWR Without Error Boundary

**Issue:** Some useSWR patterns lack comprehensive error handling
- **Files:** 15+ components using useSWR
- **Impact:** Users see stale or missing data without knowing why
- **Status:** ✅ Resolved (global SWR error toasts + retry backoff)
- **Fix approach:**
  - Create custom hook: `useSwrWithErrorBoundary`
  - Add Sentry/error tracking for failed API calls
  - Ensure all SWR hooks have error UI

### CSRF Token Handling Unclear

**Issue:** Components use csrfFetch() but token source not documented
- **Files:** `src/components/Tv/TvDetailClientNew/index.tsx:408`, various form submissions
- **Status:** ✅ Resolved (documented in README)
- **Fix approach:**
  - Document CSRF token handling in README
  - Add assertions that all POST/PUT/DELETE use csrfFetch
  - Regular security audit of API routes

---

## 📊 Scaling Limits

### Database Connection Pool Exhaustion

**Issue:** Default pool size of 20 connections may be insufficient
- **Current capacity:** `DB_POOL_MAX ?? 20` connections
- **Trigger:** 20+ concurrent requests with queries > 30s
- **Status:** ✅ Resolved (default pool max increased to 50)
- **Fix approach:**
  - Increase DB_POOL_MAX in production config (50-100)
  - Add per-endpoint rate limiting
  - Optimize slow queries with indexes

### Jellyfin API Rate Limiting

**Issue:** No rate limiting for Jellyfin requests
- **Trigger:** Calendar view with large library + availability checks
- **Status:** ✅ Resolved (concurrency limiter + backoff on 429/503)
- **Fix approach:**
  - Implement request queue with concurrency limit (p-limit to 5 concurrent)
  - Add exponential backoff for 429/503 responses
  - Cache availability more aggressively (24h for stable items)

### TMDB API Quota Usage

**Issue:** No tracking of TMDB API quota consumption
- **Limit:** 40 requests per 10 seconds per IP
- **Status:** ✅ Resolved (logs rate limit headers)
- **Fix approach:**
  - Log TMDB response headers (X-RateLimit-Remaining)
  - Alert admin when quota usage > 80%
  - Implement request debouncing for search

---

## 🧪 Test Coverage Gaps

### No Tests for Database Transaction Rollback

- **Files:** `src/db.ts:187-279`
- **What's not tested:** Sonarr/Radarr provider failure during transaction
- **Risk:** Database corruption on provider integration failures
- **Status:** ⏳ Pending (tests not added)

### Missing Tests for Jellyfin Availability Edge Cases

- **Files:** `src/lib/jellyfin.ts:50-100`
- **What's not tested:** Items with no ProviderIds, malformed API responses
- **Priority:** High - affects request status accuracy
- **Status:** ⏳ Pending (tests not added)

### Calendar API Integration Tests Missing

- **Files:** `src/app/api/calendar/route.ts`
- **What's not tested:** Genre filtering with missing metadata, date boundary conditions
- **Status:** ⏳ Pending (tests not added)

### Component Render Tests Incomplete

- **Files:** `src/components/Tv/TvDetailClientNew/index.tsx`
- **What's not tested:** Season expand/collapse, episode request submission, error states
- **Status:** ⏳ Pending (tests not added)

### No Tests for Async Race Conditions

- **What's not tested:** Rapid date navigation, duplicate request submission, concurrent season loads
- **Status:** ⏳ Pending (tests not added)

---

## 📈 Priority Recommendations

**Week 1 - Security (CRITICAL):**
1. Add URL validation for SSRF prevention
2. Add production warning for debug flags
3. Enforce HTTPS for API keys

**Week 2 - Reliability (HIGH):**
1. Fix database transaction error handling
2. Implement Jellyfin cache invalidation
3. Add type safety to database functions

**Week 3 - Performance (MEDIUM):**
1. Batch Jellyfin availability checks
2. Add calendar event caching
3. Implement LRU cache with size limits

**Week 4+ - Tech Debt (LOW):**
1. Refactor large components
2. Add comprehensive test coverage
3. Improve error boundaries

---

*Concerns audit: 2026-01-23*
*Last fixes: Console logging, AbortController, error handling*
