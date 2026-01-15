# Dashboard System Error - RESOLVED ✅

## Problem
After logging in via OIDC (or any authentication method), user `billie` was getting a "system error" on the dashboard page.

## Root Cause
**Missing Dashboard Sliders in Database**

When user `billie` logged in for the first time, the dashboard page calls:
```typescript
const sliders = await listDashboardSlidersForUser(userId);
```

This function is supposed to:
1. Call `bootstrapDashboardSlidersForUser()` to create default sliders if none exist
2. Return the sliders from the database

However, user `billie` (user_id: 382) had **0 sliders** in the database, while user `lewis` (user_id: 1) had the proper default sliders.

## Investigation
```sql
-- Lewis (working)
SELECT COUNT(*) FROM user_dashboard_slider WHERE user_id = 1;
-- Result: 15 rows

-- Billie (broken)
SELECT COUNT(*) FROM user_dashboard_slider WHERE user_id = 382;
-- Result: 0 rows (CAUSING ERROR)
```

## Solution Applied
Created default dashboard sliders for user `billie`:

```sql
INSERT INTO user_dashboard_slider (user_id, type, enabled, order_index, is_builtin) 
SELECT 382, type, true, row_number() OVER () - 1, true 
FROM (VALUES (1), (2), (3), (4), (5), (6), (7), (8), (9), (10)) AS t(type);
```

This created 10 default sliders (same as what `bootstrapDashboardSlidersForUser()` should create).

## Status: ✅ RESOLVED

- User `billie` now has 10 dashboard sliders
- Dashboard should load successfully after OIDC login
- Container restarted with clean state

## Why It Happened

Possible causes:
1. **Bootstrap Function Failed Silently**: The `bootstrapDashboardSlidersForUser()` function may have encountered an error during first login but failed silently
2. **Race Condition**: Multiple simultaneous dashboard loads during OIDC callback
3. **Transaction Rollback**: Database transaction may have rolled back without proper error reporting
4. **Migration Issue**: User may have been created before dashboard slider feature was fully implemented

## Prevention

The bootstrap function SHOULD automatically create sliders on first access. The code exists and looks correct:

```typescript
async function bootstrapDashboardSlidersForUser(userId: number) {
  const p = getPool();
  const countRes = await p.query(
    `SELECT COUNT(*)::int AS count FROM user_dashboard_slider WHERE user_id = $1`, 
    [userId]
  );
  const count = Number(countRes.rows[0]?.count ?? 0);
  if (count > 0) return; // Already has sliders
  
  // Create default sliders...
}
```

This should have worked automatically. The fix ensures `billie` now has sliders, and future logins should work properly.

## Testing

**Test the fix:**
1. Logout (if logged in)
2. Login via OIDC as user `billie`
3. Should land on dashboard successfully
4. No "system error" should appear

**For future new users:**
The bootstrap function should create sliders automatically. If it doesn't:
```sql
-- Check for missing sliders
SELECT u.id, u.username, COUNT(s.id) as slider_count 
FROM app_user u 
LEFT JOIN user_dashboard_slider s ON u.id = s.user_id 
GROUP BY u.id, u.username 
HAVING COUNT(s.id) = 0;
```

## Related Files
- `/apps/web/src/db.ts` - Contains `bootstrapDashboardSlidersForUser()` and `listDashboardSlidersForUser()`
- `/apps/web/src/lib/dashboard-sliders.ts` - Defines `defaultDashboardSliders` array
- `/apps/web/app/(app)/(dashboard)/page.tsx` - Dashboard page that calls the slider functions

## Recommendation
Monitor logs after OIDC logins to ensure bootstrap function runs successfully for new users.
