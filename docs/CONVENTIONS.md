# Coding Conventions

**Analysis Date:** 2026-01-23

## Naming Patterns

**Files:**
- React components: PascalCase with `.tsx` extension (`Button.tsx`, `Modal.tsx`, `NotificationBell.tsx`)
- Component directories with index: `ComponentName/index.tsx` for barrel exports (`/opt/LeMedia/apps/web/src/components/Common/Modal/index.tsx`)
- Utility/library files: camelCase with `.ts` extension (`asyncLock.ts`, `authUtils.ts`, `csvCache.ts`)
- API routes: `route.ts` following Next.js App Router convention (`/opt/LeMedia/apps/web/app/api/push/test/route.ts`)
- Hooks: `useHookName.ts` format (`useLockBodyScroll.ts`, `useUser.ts`, `useMediaQuery.ts`)

**Functions:**
- Async functions: camelCase starting with verb (`sendEmail`, `syncJellyfinAvailability`, `getActiveMediaService`)
- Component functions: PascalCase (`Button`, `Modal`, `AnimatedCheckbox`, `NotificationBell`)
- Private helper methods: use underscore prefix or private scope in classes (`_acquire`, `_release` in `AsyncLock`)
- Utility functions: descriptive camelCase (`hashPassword`, `verifyPassword`, `cn` for classname utility)

**Variables:**
- Boolean variables: `is` or `has` prefix (`isLocked`, `isAdmin`, `hasPermission`, `isOpen`, `isLoading`)
- Component props: spelled out full names (`disabled`, `checked`, `onChange`, `onClose`)
- State: `const [state, setState] = useState(...)` pattern for React hooks
- Constants: UPPER_SNAKE_CASE for config (`DEFAULT_ROTATION_SPEED = 6000`, `VAPID_PRIVATE_KEY`)
- Database fields: snake_case from database layer, mapped to camelCase in TypeScript

**Types:**
- Interface names: PascalCase (`ButtonProps`, `AnimatedCheckboxProps`, `CalendarEvent`)
- Type aliases: PascalCase (`ButtonType`, `Notification`, `NotificationsResponse`)
- Generic type parameters: single uppercase letters or descriptive names (`<T>`, `<P extends React.ElementType>`)
- Union/Enum types: PascalCase (`Permission`, `UserType`, `NotificationEndpointType`)

## Code Style

**Formatting:**
- ESLint config: `eslint.config.js` (modern flat config format) with Next.js recommended rules
- ESLint extends: `eslint-config-next` core-web-vitals
- Ignored patterns: `public/sw.js` (service worker)
- No Prettier config found; ESLint handles linting

**Linting:**
- Tool: ESLint 9.39.2 with Next.js preset
- Run command: `npm run lint` (from `/opt/LeMedia/apps/web`)
- Files follow Strict TypeScript: `strict: true` in `tsconfig.json`
- Core rule focus: Core Web Vitals compliance for Next.js apps

## Import Organization

**Order:**
1. External libraries (`import React from 'react'`, `import { NextRequest } from "next/server"`)
2. Next.js built-ins (`import Link from 'next/link'`, `import Image from 'next/image'`)
3. Radix UI and component libraries (`import * as DropdownMenu from "@radix-ui/react-dropdown-menu"`)
4. Internal absolute imports from `@/` alias (`import { requireUser } from "@/auth"`)
5. Type imports if needed (`import type { ForwardedRef } from 'react'`)

**Path Aliases:**
- `@/*` maps to `./src/*` (defined in `tsconfig.json`)
- All internal imports use `@/` prefix convention throughout codebase
- Example: `import { cn } from "@/lib/utils"`

## Error Handling

**Patterns:**
- Try-catch blocks with type narrowing: `catch (err: any)` for database operations
- Custom error classes: `export class ActiveRequestExistsError extends Error` in `db.ts`
- NextResponse error returns for API routes: `return NextResponse.json({ error: "message" }, { status: 400 })`
- Check if response is error: `if (user instanceof NextResponse) return user;` pattern in API handlers
- Promise.allSettled for batch operations with per-item error handling (push notifications in `/opt/LeMedia/apps/web/app/api/push/test/route.ts`)
- Silent catch and logging: `.catch(() => {})` for non-critical operations
- Async error propagation: `throw e` in database functions after logging context

**Validation:**
- Zod schemas for input validation: `const schema = z.object({ field: z.string().min(1) })`
- SafeParse pattern: `const parsed = schema.safeParse(input); if (!parsed.success) return error`
- Parse pattern for strict validation: `const validated = schema.parse(input)` in trusted contexts
- Environment variable validation: Zod schemas with `.parse(resolveEnv())` pattern (`email.ts`)
- Type narrowing after validation: destructure `parsed.data` directly

## Logging

**Framework:** `console.*` methods directly (no dedicated logging library)

**Patterns:**
- Debug logging: `console.log("[AUTH] message")` with bracketed context prefixes
- Error logging: `console.error("[Context] message", error)` when exceptions occur
- Conditional debug: `if (process.env.AUTH_DEBUG === "1")` checks before logging
- Push notification logging: `console.log("[Push Test]")` and `console.error("[Push Test]")` patterns
- Endpoint truncation for sensitive data: `sub.endpoint.substring(0, 50) + "..."`

## Comments

**When to Comment:**
- JSDoc/TSDoc for public functions with parameter descriptions
- Inline comments for non-obvious logic or workarounds
- Section comments for grouping related code blocks
- Comments explain "why" not "what" (code reads as what)

**JSDoc/TSDoc Pattern:**
```typescript
/**
 * Hook to lock the body scroll whenever a component is mounted or
 * whenever isLocked is set to true.
 *
 * @param isLocked Toggle the scroll lock
 * @param disabled Disables the entire hook (allows conditional skipping of the lock)
 */
export const useLockBodyScroll = (isLocked: boolean, disabled?: boolean): void => {
```

## Function Design

**Size:** Generally compact, 20-80 lines for most functions, up to 150+ for complex API handlers with multiple validation steps

**Parameters:**
- React components receive props object: `export function Button({ className, variant = "default", ...props }, ref)`
- API handlers receive `req: NextRequest` and optionally `{ params }`
- Async functions get dedicated parameters: `export async function dispatch(key: string | number, callback: () => Promise<void>)`
- Default parameters used sparingly: `rotationSpeed = DEFAULT_ROTATION_SPEED`

**Return Values:**
- React components: `React.ReactNode` or specific element type
- API routes: Always return `NextResponse` or `NextResponse.json()`
- Database functions: Return typed objects or throw errors
- Utility functions: Return specific types, no implicit `undefined` unless optional
- Async functions: Always return `Promise<T>` with explicit types

## Module Design

**Exports:**
- Named exports for utilities and components: `export function cn(...)` in `lib/utils.ts`
- Default exports for React components when single main export: `export default React.forwardRef(Button)`
- Mixed pattern: `export { Button, buttonVariants }` for variant definitions
- Type exports: `export type ButtonProps = { ... }` on interfaces/types

**Barrel Files:**
- Component directories use `index.tsx` for re-exporting component
- No barrel files in `lib/` - individual files imported directly
- Middleware pattern: Single class/function exported per file in most cases
- Example: `/opt/LeMedia/apps/web/src/components/Common/Modal/index.tsx` exports `Modal` component

---

*Convention analysis: 2026-01-23*
