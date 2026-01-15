# Login and PWA Authentication Issue - Resolution

## Summary
You reported being unable to get past the login page to access the dashboard, both in the browser and via PWA.

## Investigation Results

### What's Working ✅
1. **Application is running** - Docker container `lemedia-web` is healthy on port 3010
2. **Database is connected** - Found 2 users (billie, lewis) with MFA enabled  
3. **Login page loads** - Returns HTTP 200
4. **CSRF system works** - `/api/v1/csrf` endpoint successfully sets cookies
5. **Build succeeds** - No TypeScript or compilation errors
6. **Calendar feature** - Built successfully, no system errors from the new calendar feature

### The Real Issue 🔍
The authentication system requires:
1. **CSRF token** - Set via `/api/v1/csrf` endpoint (working)
2. **Valid credentials** - Username + password from database (have users)
3. **MFA verification** - Both users have MFA enabled

## Root Cause
**Both users (billie and lewis) have MFA (Multi-Factor Authentication) enabled.**

This means after entering username/password, you MUST:
1. Enter correct username and password
2. Be redirected to `/mfa` or `/mfa_setup` page
3. Enter your MFA/OTP code from your authenticator app
4. Only then get the session cookie to access the dashboard

## Solution Options

### Option 1: Bypass MFA for Testing (Temporary)
Disable MFA in the database for one user:

```bash
docker exec lemedia-db psql -U lemedia -d lemedia -c "UPDATE app_user SET mfa_secret = NULL WHERE username = 'billie';"
```

### Option 2: Complete MFA Flow (Proper)
1. Login with username/password
2. You'll be redirected to `/mfa` page  
3. Enter the 6-digit code from your authenticator app (Google Authenticator, Authy, etc.)
4. You'll then get full session access

### Option 3: Check if OTP is Disabled
Check the settings:

```bash
cat /opt/LeMedia/.env | grep OTP
```

If `auth.otp_enabled` is set to `0` or `false` in the database, MFA should be bypassed even with secrets set.

## PWA Specific Issues

The PWA service worker (`/public/sw.js`) properly handles authentication:
- ✅ Skips caching for `/api/` endpoints
- ✅ Network-first strategy for HTML pages  
- ✅ Falls back to offline page when no network
- ✅ Does NOT interfere with POST requests (login)

## Testing Steps

1. **Open browser dev tools** (F12)
2. **Go to login page**: `http://localhost:3010/login`
3. **Check Application > Cookies** - should see `lemedia_csrf` cookie
4. **Enter credentials**: Username: `billie` (or `lewis`)
5. **Watch Network tab** - should see POST to `/api/login`
6. **Check for redirect** - should go to `/mfa` page if MFA is enabled
7. **Enter MFA code** if prompted
8. **Should redirect to dashboard** `/` after successful MFA

## Quick Fix Command

To disable MFA and test immediately:

```bash
docker exec lemedia-db psql -U lemedia -d lemedia -c "UPDATE app_user SET mfa_secret = NULL;"
```

Then try logging in again - should go straight to dashboard.

## Environment Details
- **Node ENV**: production
- **APP_BASE_URL**: https://media.leleasley.uk
- **Port**: 3010  
- **Database**: PostgreSQL (lemedia-db)
- **Users with MFA**: 2 (billie, lewis)

---

**Next Action**: Let me know if you want me to disable MFA for testing, or if you have the MFA codes to complete the authentication flow.
