# LeMedia — Developer & Agent Guidelines


## Logging

**Never use `console.log`, `console.warn`, `console.error`, or `console.info` in server-side code** (API routes, lib, server actions, etc.).

Use the structured logger instead:

```typescript
import { logger } from "@/lib/logger";

logger.debug("message", { key: value });   // suppressed in production
logger.info("message", { key: value });
logger.warn("message", { key: value });
logger.error("message", error);            // error? is an Error instance
logger.error("message", undefined, { key: value }); // when passing metadata only
```

`console.*` is only acceptable in React client components (e.g. error boundaries, `"use client"` pages) where the server logger is unavailable.

## Authentication

- Session tokens: HS256 JWT, verified via `verifySessionToken()` in `src/lib/session.ts`
- Protect routes with `requireUser()` (401) or `requireAdmin()` (403) from `src/auth.ts`
- Passwords: async scrypt via `hashPassword` / `verifyPassword` in `src/lib/auth-utils.ts`
- Sensitive DB fields (`mfa_secret`, `jellyfin_auth_token`, service secrets) are encrypted at rest — use `encryptOptionalSecret` / `decryptOptionalSecret` when reading/writing them
- CSRF: call `requireCsrf(req)` on all state-mutating API routes

## Input Validation

- Validate all API inputs with Zod at the route level
- Return generic error messages to the client (`"Invalid request"`) — log details server-side with `logger.warn`
- Never return `error.issues` or Zod details in API responses

## API Tokens

- Accept tokens via `Authorization: Bearer` or `x-api-key` header only — not query parameters
- Hash tokens with `hashUserApiToken()` before storing; use `timingSafeEqual` for comparison

## Environment

- `DEV_USER` / `ALLOW_DEV_BYPASS` must never be set in production — the app will throw at startup if they are
- `SESSION_SECRET` must be at least 32 characters
- `AUTH_DEBUG=1` must never be set in production
