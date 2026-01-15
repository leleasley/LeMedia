# LeMedia Security & Improvements Analysis

## Executive Summary

This document outlines security enhancements and improvements identified through analysis of the LeMedia codebase, with reference to Seerr (Jellyseerr) best practices. The focus is on hardening security posture, improving maintainability, and matching industry-standard security patterns.

---

## 🔴 CRITICAL SECURITY ISSUES

### 1. Docker Compose Hardcoded Credentials (HIGH PRIORITY)

**Current Issue:**
```yaml
# docker-compose.yml
environment:
  - POSTGRES_DB=lemedia
  - POSTGRES_USER=lemedia
  - POSTGRES_PASSWORD=lemedia  # ⚠️ Hardcoded password
```

**Security Risk:**
- Credentials are visible in version control
- Default credentials are easily guessable
- No separation between environments

**Fix:**
```yaml
# docker-compose.yml
services:
  lemedia-db:
    image: postgres:16-alpine
    container_name: lemedia-db
    environment:
      - POSTGRES_DB=${POSTGRES_DB:-lemedia}
      - POSTGRES_USER=${POSTGRES_USER:-lemedia}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}  # Required from .env
    volumes:
      - /opt/LeMedia/db/data:/var/lib/postgresql/data
      - /opt/LeMedia/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    restart: unless-stopped
    # Add security improvements
    security_opt:
      - no-new-privileges:true
    read_only: false  # PostgreSQL needs write access
    tmpfs:
      - /tmp
      - /var/run/postgresql
```

**Action Required:**
1. Ensure `.env` has real `POSTGRES_PASSWORD` and non-default values
2. Generate strong random passwords
3. Document password requirements in README

**Status:** ✅ Implemented in `docker-compose.yml` and `.env.example`

---

### 2. Missing Content-Security-Policy Header (HIGH PRIORITY)

**Current Issue:**
- No CSP header configured
- XSS protection relies only on X-XSS-Protection (deprecated)
- No protection against inline scripts/styles

**Security Risk:**
- Vulnerable to XSS attacks
- No control over resource loading
- Missing defense-in-depth

**Fix:**
Add to `next.config.mjs` headers:
```javascript
{
  source: "/(.*)",
  headers: [
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires unsafe-eval in dev
        "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
        "img-src 'self' data: https://image.tmdb.org https://artworks.thetvdb.com https://gravatar.com https://plex.tv",
        "font-src 'self' data:",
        "connect-src 'self' https://api.themoviedb.org https://www.omdbapi.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "upgrade-insecure-requests"
      ].join("; ")
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin"
    },
    {
      key: "Permissions-Policy",
      value: "geolocation=(), microphone=(), camera=()"
    }
  ]
}
```

**Note:** Adjust CSP based on your actual requirements. Consider using `next-safe` package for easier CSP management.

**Status:** ✅ Implemented in `apps/web/next.config.mjs`

---

### 3. Missing HSTS Header (MEDIUM PRIORITY)

**Current Issue:**
- No HSTS (HTTP Strict Transport Security) header
- Users could be downgraded to HTTP

**Fix:**
Add to `next.config.mjs` (only if the app terminates HTTPS itself):
```javascript
{
  key: "Strict-Transport-Security",
  value: "max-age=31536000; includeSubDomains; preload"
}
```

**Note:** Only enable if your reverse proxy terminates SSL. If Caddy handles SSL, add it there instead:
```caddyfile
media.leleasley.uk {
  header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  # ... rest of your config
}
```

**Status:** ✅ Implemented via Caddy

---

### 4. Error Information Leakage (MEDIUM PRIORITY)

**Current Issue:**
```typescript
// Multiple locations use console.error with full error objects
console.error("Error creating user:", error);
console.error(`Failed to fetch TMDB data for ${req.tmdb_id}:`, result.reason);
```

**Security Risk:**
- Stack traces may leak sensitive information
- Database errors might expose schema
- Error messages visible in production logs

**Fix:**
Create `/opt/LeMedia/apps/web/src/lib/logger.ts`:
```typescript
type LogLevel = "info" | "warn" | "error" | "debug";

class Logger {
  private isDev = process.env.NODE_ENV === "development";

  private sanitizeError(error: unknown): string {
    if (error instanceof Error) {
      if (this.isDev) {
        return error.stack || error.message;
      }
      // In production, only log safe error messages
      return error.message;
    }
    return String(error);
  }

  info(message: string, meta?: Record<string, unknown>) {
    console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : "");
  }

  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : "");
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const safeError = error ? this.sanitizeError(error) : "";
    const metaStr = meta ? JSON.stringify(meta) : "";
    console.error(`[ERROR] ${message}`, safeError, metaStr);
    
    // In production, consider sending to external logging service
    // e.g., Sentry, DataDog, etc.
  }

  debug(message: string, meta?: Record<string, unknown>) {
    if (this.isDev) {
      console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : "");
    }
  }
}

export const logger = new Logger();
```

**Usage:**
Replace all `console.error` calls with:
```typescript
import { logger } from "@/lib/logger";

logger.error("Error creating user", error, { userId, username });
```

**Status:** ✅ Implemented in server routes and key server libs via `apps/web/src/lib/logger.ts`

---

### 5. Request Body Size Limits Missing (MEDIUM PRIORITY)

**Current Issue:**
- No explicit body size limits
- Vulnerable to DoS via large payloads
- Default Next.js limit may be too high

**Fix:**
Add to `next.config.mjs`:
```javascript
const nextConfig = {
  // ... existing config
  experimental: {
    // ... existing
    serverActions: {
      bodySizeLimit: '1mb', // Limit server actions
    },
  },
  // Add API route body size limit via middleware or route config
};
```

Add to `apps/web/proxy.ts` (this project uses `proxy.ts` instead of `middleware.ts`):
```typescript
import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

export function proxy(request: NextRequest) {
  // Check Content-Length header
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: "Request body too large" },
      { status: 413 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|manifest.json|icon-.*|apple-touch-icon.*|robots.txt|sitemap.xml).*)",
  ],
};
```

**Status:** ✅ Implemented in `apps/web/proxy.ts` and `apps/web/next.config.mjs`

---

## 🟡 IMPORTANT SECURITY ENHANCEMENTS

### 6. Session Security Improvements

**Current Status:** ✅ Good - Uses JWT with proper expiration

**Enhancements:**
1. **Add session rotation on privilege change:**
```typescript
// In auth.ts or session.ts
export async function invalidateUserSessions(username: string) {
  // Store session version in database
  // Increment on password change, group change, etc.
  // Verify session version on each request
}
```

2. **Add session fingerprinting:**
```typescript
// Add IP/user-agent hash to session
// Reject sessions if fingerprint changes
```

3. **Implement session timeout warning:**
- Warn users before session expires
- Allow extending session with re-authentication

---

### 7. API Key Security Enhancements

**Current Status:** ✅ Good - Uses timing-safe comparison

**Enhancements:**
1. **Add API key rotation:**
```typescript
// In external-api.ts
export async function rotateExternalApiKey(): Promise<string> {
  const newKey = generateExternalApiKey();
  await setExternalApiKey(newKey);
  // Optionally keep old key for grace period
  return newKey;
}
```

2. **Add API key usage tracking:**
- Log API key usage (without exposing key)
- Track rate limits per API key
- Alert on suspicious usage patterns

3. **Add API key scopes/permissions:**
- Different keys for different operations
- Read-only vs read-write keys

---

### 8. Input Validation & Sanitization

**Current Status:** ✅ Good - Uses Zod for validation

**Enhancements:**
1. **Add HTML sanitization for user-generated content:**
```typescript
// Install: npm install dompurify isomorphic-dompurify
import DOMPurify from "isomorphic-dompurify";

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [], // No HTML tags allowed by default
    ALLOWED_ATTR: [],
  });
}

export function sanitizeText(text: string): string {
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
}
```

2. **Add SQL injection prevention audit:**
- ✅ Already using parameterized queries (good!)
- Add automated tests to verify
- Document query patterns

3. **Add path traversal protection:**
```typescript
// In proxy.ts or similar
export function sanitizePath(path: string): string {
  // Remove .. and normalize
  return path.replace(/\.\./g, "").replace(/\/+/g, "/");
}
```

---

### 9. Audit Logging for Sensitive Operations

**Current Issue:**
- No audit trail for admin actions
- Password changes not logged
- User creation/deletion not tracked

**Fix:**
Create `/opt/LeMedia/apps/web/src/lib/audit-log.ts`:
```typescript
import { getPool } from "@/db";

export type AuditAction =
  | "user.created"
  | "user.deleted"
  | "user.password_changed"
  | "user.groups_changed"
  | "user.updated"
  | "admin.settings_changed"
  | "api_key.rotated"
  | "notification_endpoint.created"
  | "notification_endpoint.deleted";

export interface AuditLogEntry {
  action: AuditAction;
  actor: string; // username
  target?: string; // target username or resource
  metadata?: Record<string, unknown>;
  ip?: string;
}

export async function logAuditEvent(entry: AuditLogEntry) {
  const p = getPool();
  await p.query(
    `INSERT INTO audit_log (action, actor, target, metadata, ip, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      entry.action,
      entry.actor,
      entry.target ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.ip ?? null,
    ]
  );
}
```

Add to `db/init.sql`:
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  target TEXT,
  metadata JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
```

**Usage:**
```typescript
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

await logAuditEvent({
  action: "user.password_changed",
  actor: currentUser.username,
  target: targetUser.username,
  ip: getClientIp(req),
});
```

**Status:** ⚠️ Partial - schema and helper implemented; endpoints still need to call `logAuditEvent`

---

### 10. Rate Limiting Enhancements

**Current Status:** ✅ Good - Rate limiting implemented

**Enhancements:**
1. **Add distributed rate limiting (for multi-instance deployments):**
```typescript
// Use Redis for shared rate limit state
// Or use database-backed rate limiting
```

2. **Add adaptive rate limiting:**
- Reduce limits for suspicious IPs
- Increase limits for trusted users

3. **Add rate limit headers:**
```typescript
// Add X-RateLimit-* headers to responses
response.headers.set("X-RateLimit-Limit", String(opts.max));
response.headers.set("X-RateLimit-Remaining", String(remaining));
response.headers.set("X-RateLimit-Reset", String(resetAt));
```

---

## 🟢 NICE-TO-HAVE IMPROVEMENTS

### 11. Security.txt File

**Purpose:** Standardized way to report security vulnerabilities

**Fix:**
Add a route handler to serve it (no public file required):
```typescript
// app/.well-known/security.txt/route.ts
export async function GET() {
  return new Response(
    `Contact: mailto:security@yourdomain.com\nExpires: 2025-12-31T23:59:59.000Z\nPreferred-Languages: en\nCanonical: https://yourdomain.com/.well-known/security.txt`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    }
  );
}
```

**Status:** ✅ Implemented in `apps/web/app/.well-known/security.txt/route.ts`

---

### 12. Docker Security Hardening

**Enhancements:**
1. **Run as non-root user:**
```dockerfile
# In Dockerfile
FROM node:20-alpine AS run
WORKDIR /app
# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001
# Copy files
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Switch to non-root user
USER nextjs
EXPOSE 3010
CMD ["node", "server.js"]
```

2. **Add healthcheck:**
```yaml
# In docker-compose.yml
lemedia-web:
  # ... existing config
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://localhost:3010/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

3. **Add resource limits:**
```yaml
lemedia-web:
  # ... existing config
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        cpus: '0.5'
        memory: 512M
```

**Status:** ⚠️ Partial - non-root user and healthcheck implemented; resource limits not applied

---

### 13. Environment Variable Validation

**Current Status:** ✅ Partial - Some validation exists

**Enhancement:**
Create `/opt/LeMedia/apps/web/src/lib/env-validation.ts` and call it on server startup:
```typescript
import "server-only";
import { z } from "zod";

let validated = false;

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SERVICES_SECRET_KEY: z.string().min(1),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3010),
});

export function validateEnv() {
  if (validated) return;
  validated = true;
  EnvSchema.parse(process.env);
}
```

**Status:** ✅ Implemented and called from `apps/web/src/db.ts`

---

### 14. API Documentation

**Enhancement:**
Add OpenAPI/Swagger documentation for API endpoints:

1. Install dependencies:
```bash
npm install swagger-ui-react swagger-jsdoc
```

2. Create API documentation:
```typescript
// app/api/docs/route.ts
import { OpenAPIV3 } from "openapi-types";

const openApiSpec: OpenAPIV3.Document = {
  openapi: "3.0.0",
  info: {
    title: "LeMedia API",
    version: "1.0.0",
  },
  servers: [
    {
      url: process.env.APP_BASE_URL || "http://localhost:3010",
    },
  ],
  paths: {
    "/api/v1/request": {
      // Document endpoints
    },
  },
};

export async function GET() {
  return Response.json(openApiSpec);
}
```

---

### 15. Health Check Endpoint Enhancements

**Current Status:** ✅ Basic health check exists

**Enhancement:**
Create comprehensive health check:
```typescript
// app/api/health/route.ts
import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/db";
import { getExternalApiKey } from "@/lib/external-api";

export async function GET() {
  const database = await checkDatabaseHealth();
  const apiKeyConfigured = (await getExternalApiKey()) !== null;
  const response = NextResponse.json(
    {
      ok: database,
      database: database ? "connected" : "disconnected",
      apiKey: apiKeyConfigured,
      ts: new Date().toISOString()
    },
    { status: database ? 200 : 503 }
  );
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
```

**Status:** ✅ Implemented in `apps/web/app/api/health/route.ts`

---

## 📊 Implementation Priority

| Priority | Issue | Impact | Effort | Status |
|----------|-------|--------|--------|--------|
| 🔴 Critical | Docker credentials | High | Low | ✅ Done |
| 🔴 Critical | CSP header | High | Medium | ✅ Done |
| 🔴 Critical | Error logging | Medium | Medium | ✅ Done |
| 🟡 Important | Request size limits | Medium | Low | ✅ Done |
| 🟡 Important | Audit logging | Medium | Medium | ⚠️ Partial |
| 🟡 Important | HSTS header | Low | Low | ✅ Done (Caddy) |
| 🟢 Nice-to-have | Security.txt | Low | Low | ✅ Done |
| 🟢 Nice-to-have | Docker hardening | Low | Medium | ⚠️ Partial |
| 🟢 Nice-to-have | API docs | Low | High | ⏳ Pending |

---

## ✅ Already Implemented (Good Practices)

1. ✅ **Parameterized SQL queries** - All database queries use parameterized statements
2. ✅ **CSRF protection** - CSRF tokens implemented for state-changing operations
3. ✅ **Rate limiting** - Comprehensive rate limiting on sensitive endpoints
4. ✅ **Session security** - JWT-based sessions with proper expiration
5. ✅ **Input validation** - Zod schemas for request validation
6. ✅ **API key security** - Timing-safe comparison for API keys
7. ✅ **Password hashing** - Proper password hashing (assumed bcrypt/argon2)
8. ✅ **MFA support** - Two-factor authentication implemented
9. ✅ **Security headers** - X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
10. ✅ **Same-origin checks** - Origin validation for CSRF protection

---

## 🔍 Security Audit Checklist

- [ ] Review all environment variables for sensitive data
- [ ] Audit all API endpoints for proper authentication
- [ ] Review error messages for information leakage
- [ ] Check for hardcoded secrets/API keys
- [ ] Verify all user inputs are validated
- [ ] Review database permissions
- [ ] Check file upload handling (if applicable)
- [ ] Review CORS configuration (if applicable)
- [ ] Audit logging and monitoring
- [ ] Review dependency vulnerabilities (`npm audit`)

---

## 📝 Notes

1. **Seerr Comparison:** LeMedia already implements many security best practices found in Seerr, including proper authentication, rate limiting, and input validation.

2. **API Security:** The external API implementation is solid with timing-safe key comparison and proper encryption for stored secrets.

3. **Database Security:** All queries use parameterized statements, preventing SQL injection. Consider adding database user with minimal required permissions.

4. **Monitoring:** Consider adding application performance monitoring (APM) and security event monitoring for production deployments.

5. **Backup Strategy:** Ensure database backups are configured and tested regularly.

---

## 🚀 Quick Wins (Can implement immediately)

1. ✅ Move Docker credentials to environment variables
2. ✅ Add CSP header to next.config.mjs
3. ✅ Add request body size limits
4. ✅ Add HSTS header via Caddy
5. ✅ Create security.txt endpoint
6. ⚠️ Wire audit logging into admin/user actions
7. ⏳ Add API docs (OpenAPI)

---

## 📚 References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/configuring/security-headers)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)

---

**Last Updated:** 2026-01-07
**Next Review:** 2026-04-07
