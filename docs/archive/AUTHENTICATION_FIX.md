# Authentication Issue Fix

## Problem Identified
The CSRF token is not being set properly on the login page, showing as empty:
```html
<input type="hidden" name="csrf_token" value=""/>
```

## Root Cause
The `lemedia_csrf` cookie is not being set when the login page loads. The cookie should be set server-side but it's currently `undefined`.

## Issues Found:
1. **CSRF Cookie Not Set**: Login page renders with `csrfToken` as `undefined`
2. **Cookie Configuration**: May need to check cookie security settings for PWA
3. **Service Worker**: PWA service worker may be caching login attempts

## Solution Steps:

### 1. Fix CSRF Cookie Generation
The login page needs to ensure CSRF cookie is created if missing.

### 2. Check Cookie Security Settings
- Cookies must work with both HTTPS (production) and HTTP (development)
- SameSite=Lax should work for same-origin requests
- Secure flag should match protocol

### 3. PWA Service Worker
- Service worker should not cache POST requests
- API calls should always hit the network first
- Login/auth endpoints should bypass service worker cache

## Testing Checklist:
- [ ] CSRF cookie is set on login page load
- [ ] Login form submits with valid CSRF token
- [ ] Session cookie is set after successful login
- [ ] PWA login works (service worker doesn't interfere)
- [ ] Regular browser login works
- [ ] Redirect to dashboard after login

## Current Environment:
- NODE_ENV: production
- APP_BASE_URL: https://media.leleasley.uk
- SESSION_SECRET: Set
- Database: Connected (2 users found)
- Application: Running on port 3010 in Docker
