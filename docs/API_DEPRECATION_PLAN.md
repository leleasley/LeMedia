# API Deprecation Plan

Last updated: 2026-02-11

## Current State

- Total API route files under `apps/web/app/api`: `444`
- Duplicate route pairs (`/api/...` and `/api/v1/...` both present): `154`
- Largest duplication clusters:
  - `/admin/notifications/*` (44 pairs)
  - `/admin/settings/*` (14 pairs)
  - `/admin/users/*` (10 pairs)

The current duplicate baseline is tracked in:

- `apps/web/tests/fixtures/api-duplicate-baseline.json`

## Goal

Reduce and eventually remove duplicate `/api/v1` compatibility endpoints while preserving client compatibility during transition.

## Phased Plan

1. Phase 1: Freeze duplicate growth (now)
- Enforce automated check: no new `/api` + `/api/v1` duplicates.
- Keep existing duplicates as baseline.

2. Phase 2: Add compatibility metadata
- Status: started.
- Middleware now adds headers on all `/api/v1/*` responses:
  - `Deprecation: true`
  - `Sunset: Wed, 30 Sep 2026 23:59:59 GMT`
  - `Link: <.../api/...>; rel="successor-version"`
- Implementation location: `apps/web/proxy.ts`.

3. Phase 3: Migrate callers
- Inventory internal callers (UI, scripts, integrations).
- Move internal usage to canonical non-`/v1` routes first.
- Track remaining external usage in logs/metrics.

4. Phase 4: Remove low-risk duplicates
- Start with endpoints with no observed usage for at least 30 days.
- Remove in batches by domain (e.g., notifications first, then settings, then users).

5. Phase 5: Remove remaining compatibility layer
- Remove all `/v1` duplicates after communication window and usage verification.

## CI Guardrails

The following tests enforce policy:

- `apps/web/tests/api-route-duplication.test.ts`
  - Fails on newly introduced duplicate `/api` + `/api/v1` pairs.
- `apps/web/tests/api-v1-client-usage.test.ts`
  - Fails if app-facing source increases usage of `/api/v1` client calls.
- `apps/web/tests/api-route-policy.test.ts`
  - Fails when mutating routes are added without visible auth/CSRF/rate-limit policy signals.
