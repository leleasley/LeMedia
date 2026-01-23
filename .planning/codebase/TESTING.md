# Testing Patterns

**Analysis Date:** 2026-01-23

## Test Framework

**Status:** No testing framework currently configured or in use

**Test Coverage:**
- Zero test files found across the entire codebase
- No test directories (`__tests__`, `tests`, `.test.ts`, `.spec.ts`)
- No testing dependencies installed (Jest, Vitest, Mocha, @testing-library all absent from package.json)
- No test configuration files found (jest.config.js, vitest.config.ts, mocha.opts)

**Development Stack:**
- TypeScript enabled for strict type checking (`strict: true` in tsconfig.json)
- ESLint configured for code quality
- TypeScript serves as primary type safety mechanism currently

## Run Commands

Currently no test commands defined. When testing is implemented:

```bash
npm run test              # Would run all tests
npm run test:watch       # Would run in watch mode
npm run test:coverage    # Would generate coverage report
```

## Recommended Testing Framework

For a Next.js + React project of this scale, the recommended approach would be:

**Unit Testing:**
- **Framework:** Vitest (faster than Jest, better ESM support)
- **Library:** @testing-library/react for component testing
- **Assertions:** Vitest built-in assertions or @testing-library/jest-dom

**Integration Testing:**
- **Framework:** Vitest with msw (mock service worker) for API mocking
- **Scope:** Test API routes, database interactions, auth flows

**E2E Testing:**
- **Framework:** Playwright or Cypress
- **Scope:** Critical user flows (request submission, notifications, auth)

## Test File Organization

**Recommended Location Pattern:**
- Co-located tests: `ComponentName.test.tsx` next to `ComponentName.tsx`
- Library tests: `lib/utils.test.ts` next to `lib/utils.ts`
- API tests: `app/api/[route]/route.test.ts` next to `app/api/[route]/route.ts`
- Hook tests: `hooks/useHookName.test.ts` next to `hooks/useHookName.ts`

**File Structure (when implemented):**
```
src/
├── components/
│   ├── Common/
│   │   ├── Button.tsx
│   │   └── Button.test.tsx
│   └── Modal/
│       ├── index.tsx
│       └── index.test.tsx
├── hooks/
│   ├── useLockBodyScroll.ts
│   └── useLockBodyScroll.test.ts
└── lib/
    ├── utils.ts
    └── utils.test.ts
app/
├── api/
│   ├── push/
│   │   ├── test/
│   │   │   ├── route.ts
│   │   │   └── route.test.ts
```

## Test Structure Pattern (Recommended)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Button } from '@/components/Common/Button';

describe('Button Component', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });

  it('respects disabled prop', () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

## Async Testing Pattern (Recommended)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getUser } from '@/auth';

describe('Auth - getUser', () => {
  it('returns user when valid session exists', async () => {
    // Mock session
    vi.mock('@/lib/session', () => ({
      verifySessionToken: vi.fn().mockResolvedValue({
        username: 'testuser',
        jti: '123'
      })
    }));

    const user = await getUser();
    expect(user.username).toBe('testuser');
  });

  it('throws error when session invalid', async () => {
    vi.mock('@/lib/session', () => ({
      verifySessionToken: vi.fn().mockResolvedValue(null)
    }));

    await expect(getUser()).rejects.toThrow('Unauthorized');
  });
});
```

## Mocking

**Recommended Framework:** Mock Service Worker (msw) for API mocking

**Patterns (When Implemented):**

**API Route Mocking:**
```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('/api/notifications/unread', () => {
    return HttpResponse.json({
      notifications: [],
      unreadCount: 0
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

**Database Mocking:**
- Mock database functions from `@/db` module
- Use vi.fn().mockResolvedValue() for async queries
- Example: Mock `getUserPushSubscriptions()` in push notification tests

**What to Mock:**
- External APIs (TMDB, Jellyfin, Discord, Telegram webhooks)
- Database queries (`/opt/LeMedia/apps/web/src/db.ts` functions)
- Email service (nodemailer in `/opt/LeMedia/apps/web/src/notifications/email.ts`)
- Web Push service (webpush library)
- Authentication calls to verify sessions

**What NOT to Mock:**
- Core React/Next.js utilities
- Utility functions like `cn()` for class merging
- Zod validation schemas (test with real validation)
- Internal business logic (test actual implementation)

## Fixtures and Test Data (Recommended)

**Pattern:**
```typescript
// fixtures/user.ts
export const mockUser = {
  id: 1,
  username: 'testuser',
  groups: ['users'],
  isAdmin: false
};

export const mockAdminUser = {
  ...mockUser,
  isAdmin: true,
  groups: ['admins']
};

// fixtures/notifications.ts
export const mockNotification = {
  id: 1,
  type: 'request_approved',
  title: 'Request Approved',
  message: 'Your request has been approved',
  isRead: false,
  createdAt: new Date().toISOString()
};
```

**Location:** `src/__fixtures__/` or `src/__mocks__/` directory

## Critical Areas Needing Tests

**High Priority (Core Functionality):**
1. **Authentication** (`src/auth.ts`, `src/lib/auth-utils.ts`)
   - Session validation
   - Permission checking (admin, user roles)
   - Dev bypass mode
   - Token verification

2. **API Routes** (`app/api/`)
   - Request creation flow
   - Error handling with proper HTTP status codes
   - CSRF protection validation
   - User authorization checks

3. **Database Layer** (`src/db.ts`)
   - User operations
   - Media request creation
   - Concurrent request handling (AsyncLock)
   - Transaction rollback on errors

4. **Notifications** (`src/notifications/`)
   - Email sending with Zod validation
   - Discord webhook validation and sending
   - Push notification batching
   - Stale subscription cleanup

5. **Components** (`src/components/`)
   - Modal open/close behavior
   - Button click handlers
   - Animated state changes
   - Form validation

**Medium Priority:**
1. Hook testing (useLockBodyScroll, useUser, useMediaQuery)
2. Utility functions (hashPassword, verifyPassword, cn)
3. Calendar and discovery features
4. Search and filtering logic

**Lower Priority:**
1. UI animations and transitions
2. Third-party integrations (TMDB, Jellyfin)
3. Performance-critical components

## Coverage Goals (Recommended)

```
Lines:       80%+ for critical paths
Branches:    70%+ for API routes and auth
Functions:   85%+ for utilities
Statements:  80%+ overall

Critical: 100% coverage required for:
- src/auth.ts
- src/db.ts (core operations)
- src/lib/auth-utils.ts
- Notification validation logic
```

---

*Testing analysis: 2026-01-23*

**Note:** This codebase currently has zero automated tests. Implementation of comprehensive testing is a priority for stability and preventing regressions as the application grows. Start with critical auth and API route tests.
