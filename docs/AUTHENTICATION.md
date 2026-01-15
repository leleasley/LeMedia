# LeMedia Authentication System

> ⚠️ **WARNING: DO NOT MODIFY THIS CODE WITHOUT UNDERSTANDING THE FULL SYSTEM**
> 
> The authentication and logout system has been carefully designed to handle complex
> cookie management across different environments (proxies, domains, secure/insecure).
> Changes to this code can easily break login/logout functionality.

## Overview

LeMedia uses a JWT-based session system stored in HttpOnly cookies. The session token
is created on login and destroyed on logout.

## Key Files

| File | Purpose |
|------|---------|
| `app/logout/route.ts` | **CRITICAL** - Handles logout, cookie clearing |
| `app/api/login/route.ts` | Handles login, creates session token |
| `src/lib/session.ts` | JWT token creation/verification |
| `src/lib/proxy.ts` | Cookie configuration (domain, secure, sameSite) |
| `src/auth.ts` | Server-side auth helpers (`getUser`, `requireUser`) |

## Cookie Configuration

Cookies are configured based on the request context to handle various deployment scenarios:

```typescript
// From src/lib/proxy.ts
getCookieBase(ctx, httpOnly) → {
  httpOnly: boolean,
  sameSite: "lax",
  secure: boolean,        // true if HTTPS
  path: "/",
  domain?: string         // Only set if cookieDomain is configured
}
```

### Important Cookie Rules

1. **Domain attribute**: Only include if `ctx.cookieDomain` is set. Omitting it creates a "host-only" cookie
2. **Secure attribute**: Must match between set and delete operations
3. **Path**: Always "/" 
4. **SameSite**: Always "Lax"
5. **HttpOnly**: true for session cookies, false for CSRF cookie

## Session Cookies

| Cookie | HttpOnly | Purpose |
|--------|----------|---------|
| `lemedia_session` | Yes | JWT session token |
| `lemedia_csrf` | No | CSRF protection token |
| `lemedia_flash` | Yes | Flash messages |
| `lemedia_flash_error` | Yes | Error flash messages |
| `lemedia_login_redirect` | Yes | Where to redirect after login |
| `lemedia_force_login` | Yes | Force re-authentication flag |
| `lemedia_mfa_token` | Yes | MFA session identifier |

## Logout Route - CRITICAL IMPLEMENTATION DETAILS

The logout route (`app/logout/route.ts`) uses **raw `Set-Cookie` headers** exclusively.
This is intentional and required for proper cookie clearing.

### Why Raw Headers?

1. **Next.js cookies API limitation**: When using `res.cookies.set()`, Next.js manages cookies
   internally. If you mix `res.headers.append("Set-Cookie", ...)` with `res.cookies.set()`,
   they can conflict and overwrite each other.

2. **Multiple cookies with same name**: To clear cookies that may have been set with different
   domain configurations (with domain vs host-only), we need to send multiple `Set-Cookie`
   headers for the same cookie name. The Next.js API doesn't support this.

### Correct Implementation Pattern

```typescript
// ✅ CORRECT - Use ONLY raw headers in logout
const buildDeleteCookie = (name, httpOnly, includeDomain) => {
  const parts = [
    `${name}=`,
    "Path=/",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (includeDomain && ctx.cookieDomain) {
    parts.push(`Domain=${ctx.cookieDomain}`);
  }
  if (ctx.secure) parts.push("Secure");
  parts.push("SameSite=Lax");
  if (httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
};

// Clear both host-only and domain variants
res.headers.append("Set-Cookie", buildDeleteCookie(name, true, false));
if (ctx.cookieDomain) {
  res.headers.append("Set-Cookie", buildDeleteCookie(name, true, true));
}
```

```typescript
// ❌ WRONG - DO NOT mix APIs
res.headers.append("Set-Cookie", ...);  // Raw header
res.cookies.set("name", "value", {...}); // Next.js API - WILL CONFLICT!
```

## Login Route

The login route (`app/api/login/route.ts`) uses the Next.js cookies API (`res.cookies.set()`)
which is fine because it's only setting new cookies, not dealing with clearing old ones.

```typescript
// ✅ OK in login route
res.cookies.set("lemedia_session", token, { ...cookieBase, maxAge: sessionMaxAge });
res.cookies.set("lemedia_flash", "login-success", { ...cookieBase, maxAge: 120 });
```

## Flash Messages

Flash messages are set as HttpOnly cookies and read server-side in the root layout.
They're passed to `ToastProvider` as `initialToasts`.

### Flow
1. Login/Logout sets `lemedia_flash` cookie
2. Root layout reads cookie, creates `initialToasts` array
3. `ToastProvider` displays toasts on client
4. Client calls `/api/flash/clear` to remove the cookie

### Deduplication
Toast messages use `sessionStorage` with a 5-second cooldown to prevent duplicate
toasts on rapid navigation. The key format is `lemedia_toast_seen:{dedupeKey}`.

### iOS PWA Safe Areas
Toast notifications use `env(safe-area-inset-top)` to position below the notch/Dynamic Island
on iOS devices. This requires:

1. `viewport-fit=cover` in the viewport meta tag (already configured in `app/layout.tsx`)
2. `apple-mobile-web-app-capable=yes` meta tag (already configured)
3. CSS: `top: calc(env(safe-area-inset-top, 0px) + 12px)`

The fallback value of `0px` ensures proper positioning on non-iOS devices or regular browsers.
Safe area insets are automatically provided by iOS Safari when running as a PWA.

## Proxy/Reverse Proxy Considerations

### Authelia Integration
If Authelia is in front of LeMedia, the `authelia_session` cookie will be present.
LeMedia attempts to clear it during logout but this only works if the cookie domain
matches. For full SSO logout, configure `authelia_logout_url` in the database:

```sql
INSERT INTO settings (key, value) 
VALUES ('authelia_logout_url', 'https://auth.yourdomain.com/logout')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### Headers to Check
When debugging, look for these headers:
- `X-Forwarded-Host` - Used to determine request host
- `X-Forwarded-Proto` - Used to determine HTTPS vs HTTP
- `X-Forwarded-For` - Client IP for rate limiting

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | **Required** - Min 32 chars, used to sign JWTs |
| `SESSION_MAX_AGE` | Session duration in seconds (default: 30 days) |
| `APP_BASE_URL` | Base URL for cookie domain calculation |
| `AUTH_ADMIN_GROUP` | Group name for admin access (default: "admins") |
| `DEV_USER` | **Danger** - Bypasses auth in development |

## Debugging

Enable auth debugging by setting:
```
AUTH_DEBUG=1
```

This will log session token presence, verification results, and user info to the console.

## Testing Logout

1. Login to the application
2. Open browser DevTools → Network tab
3. Click logout
4. Check the response headers for `Set-Cookie` entries
5. Verify `lemedia_session` cookie is being cleared (Max-Age=0, Expires in past)
6. Check that you're redirected to `/login`
7. Verify the flash message "You have logged out" appears

## Common Issues

### "Logout doesn't work"
- Check if cookie domain matches between login and logout
- Verify both host-only and domain variants are being cleared
- Look for proxy stripping `Set-Cookie` headers

### "Flash messages don't show"
- Check if cookie is HttpOnly (should be)
- Verify root layout is reading the cookie
- Check sessionStorage for dedupe key blocking display

### "Infinite redirect loop"
- Check for `lemedia_force_login` cookie not being cleared
- Verify session token verification is working
- Check for middleware redirecting before logout completes

---

**Last Updated**: January 2026
**Author**: Initial implementation and documentation
