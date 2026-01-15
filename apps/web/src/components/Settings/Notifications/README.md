# LeMedia Notification Components

Comprehensive notification form components for LeMedia, based on Jellyseerr's notification system implementation.

## Overview

These components provide a complete notification management system for LeMedia, supporting 10 different notification types with full configuration capabilities.

## Components

### Core Components

#### NotificationTypeSelector
A shared component for selecting which notification events to trigger on:
- Media Requested
- Media Approved
- Media Available
- Media Declined
- Media Failed
- Media Auto-Approved
- Test Notification

### Notification Type Components

All notification components follow a consistent pattern with:
- Enable/disable toggle
- Agent-specific configuration fields
- Notification type selector (where applicable)
- Test notification button
- Save changes button
- Form validation
- Toast notifications for feedback
- CSRF protection

#### 1. NotificationsEmail
**Path:** `NotificationsEmail.tsx`

Configures email notifications via SMTP.

**Fields:**
- Enable Agent (checkbox)
- User Email Required (checkbox)
- Sender Name (text)
- Sender Address (email) *required when enabled*
- SMTP Host (text) *required when enabled*
- SMTP Port (number) *required when enabled*
- Encryption Method (select: none, default, opportunistic, implicit)
- SMTP Username (text)
- SMTP Password (password)
- Allow Self-Signed Certificates (checkbox)

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/email`
- POST test: `/api/admin/notifications/email/test`

#### 2. NotificationsDiscord
**Path:** `NotificationsDiscord.tsx`

Configures Discord webhook notifications.

**Fields:**
- Enable Agent (checkbox)
- Webhook URL (url) *required when enabled*
- Bot Username (text)
- Bot Avatar URL (url)
- Notification Role ID (text)
- Enable Mentions (checkbox)
- Notification Types (multi-select) *required when enabled*

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/discord`
- POST test: `/api/admin/notifications/discord/test`

#### 3. NotificationsTelegram
**Path:** `NotificationsTelegram.tsx`

Configures Telegram bot notifications.

**Fields:**
- Enable Agent (checkbox)
- Bot Authorization Token (password) *required when enabled*
- Bot Username (text)
- Chat ID (text) *required when types selected*
- Thread/Topic ID (text)
- Send Silently (checkbox)
- Notification Types (multi-select) *required when enabled*

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/telegram`
- POST test: `/api/admin/notifications/telegram/test`

#### 4. NotificationsWebhook
**Path:** `NotificationsWebhook.tsx`

Configures custom webhook notifications with JSON payload.

**Fields:**
- Enable Agent (checkbox)
- Webhook URL (url) *required when enabled*
- Authorization Header (password)
- JSON Payload (textarea) *required when enabled*
- Notification Types (multi-select) *required when enabled*

**Features:**
- JSON payload editor with template variables
- Reset to default payload button
- JSON validation

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/webhook`
- POST test: `/api/admin/notifications/webhook/test`

#### 5. NotificationsWebPush
**Path:** `NotificationsWebPush.tsx`

Configures browser push notifications.

**Fields:**
- Enable Agent (checkbox)
- Notification Types (multi-select) *required when enabled*

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/webpush`
- POST test: `/api/admin/notifications/webpush/test`

#### 6. NotificationsGotify
**Path:** `NotificationsGotify.tsx`

Configures Gotify push notifications.

**Fields:**
- Enable Agent (checkbox)
- Server URL (url) *required when enabled*
- Application Token (password) *required when enabled*
- Priority (number, 0-10)
- Notification Types (multi-select) *required when enabled*

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/gotify`
- POST test: `/api/admin/notifications/gotify/test`

#### 7. NotificationsNtfy
**Path:** `NotificationsNtfy.tsx`

Configures Ntfy push notifications.

**Fields:**
- Enable Agent (checkbox)
- Ntfy URL (url) *required when enabled*
- Topic (text) *required when enabled*
- Priority (select: Min, Low, Default, High, Urgent)
- Authentication Method (select: none, basic, access_token)
- Username (text, shown when basic auth)
- Password (password, shown when basic auth)
- Access Token (password, shown when token auth)
- Notification Types (multi-select) *required when enabled*

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/ntfy`
- POST test: `/api/admin/notifications/ntfy/test`

#### 8. NotificationsPushbullet
**Path:** `NotificationsPushbullet.tsx`

Configures Pushbullet push notifications.

**Fields:**
- Enable Agent (checkbox)
- Access Token (password) *required when enabled*
- Channel Tag (text)
- Notification Types (multi-select) *required when enabled*

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/pushbullet`
- POST test: `/api/admin/notifications/pushbullet/test`

#### 9. NotificationsPushover
**Path:** `NotificationsPushover.tsx`

Configures Pushover push notifications.

**Fields:**
- Enable Agent (checkbox)
- User Key (password) *required when enabled*
- API Token (password) *required when enabled*
- Priority (select: Lowest, Low, Normal, High, Emergency)
- Notification Sound (select: 20+ sound options)
- Notification Types (multi-select) *required when enabled*

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/pushover`
- POST test: `/api/admin/notifications/pushover/test`

#### 10. NotificationsSlack
**Path:** `NotificationsSlack.tsx`

Configures Slack webhook notifications.

**Fields:**
- Enable Agent (checkbox)
- Webhook URL (url) *required when enabled*
- Bot Username (text)
- Bot Emoji (text)
- Notification Types (multi-select) *required when enabled*

**API Endpoints:**
- GET/PUT: `/api/admin/notifications/slack`
- POST test: `/api/admin/notifications/slack/test`

## Usage

### Import Individual Components

```tsx
import { NotificationsEmail } from "@/components/Settings/Notifications";
import { NotificationsDiscord } from "@/components/Settings/Notifications";
import { NotificationsTelegram } from "@/components/Settings/Notifications";

// Use in your admin panel
<NotificationsEmail />
<NotificationsDiscord />
<NotificationsTelegram />
```

### Import All Components

```tsx
import * as Notifications from "@/components/Settings/Notifications";

// Use with dynamic rendering
<Notifications.NotificationsEmail />
<Notifications.NotificationsDiscord />
```

## API Requirements

Each component expects the following API structure:

### GET `/api/admin/notifications/{type}`

Returns notification settings:

```json
{
  "enabled": boolean,
  "types": number,
  "options": {
    // Type-specific options
  }
}
```

### PUT `/api/admin/notifications/{type}`

Saves notification settings with the same structure.

### POST `/api/admin/notifications/{type}/test`

Tests the notification with provided settings.

## Features

- **TypeScript Support**: Full type safety
- **Form Validation**: Client-side validation for required fields
- **CSRF Protection**: Uses csrfFetch for all API calls
- **Toast Notifications**: User feedback for all actions
- **Loading States**: Loading indicators during data fetch
- **Error Handling**: Graceful error handling with user-friendly messages
- **Test Functionality**: Test notifications before saving
- **Responsive Design**: Works on all screen sizes
- **Accessibility**: Proper labels and ARIA attributes

## Dependencies

Required imports:
- `@/components/Providers/ToastProvider` - Toast notification system
- `@/lib/csrf-client` - CSRF-protected fetch wrapper
- `react` - React 18+

## Styling

Components use Tailwind CSS classes and expect:
- Dark theme with gray-800/gray-700 backgrounds
- Blue-500/600 accent colors
- Responsive form layouts

## Backend Integration

Backend APIs should:
1. Validate admin permissions (401/403 for unauthorized)
2. Return proper error messages in `{ error: string }` format
3. Support the notification type selector bit flags (1, 2, 4, 8, 16, 32, 64)
4. Store sensitive fields (passwords, tokens) securely
5. Implement test notification functionality

## Notification Type Flags

The `types` field uses bit flags for notification events:
- `1` - Media Requested
- `2` - Media Approved
- `4` - Media Available
- `8` - Media Declined
- `16` - Media Failed
- `32` - Media Auto-Approved
- `64` - Test Notification

Multiple types are combined using bitwise OR (e.g., `1 | 2 | 4 = 7`).

## Example Page Implementation

```tsx
"use client";

import { useState } from "react";
import { NotificationsEmail, NotificationsDiscord, NotificationsTelegram } from "@/components/Settings/Notifications";

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("email");

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Notification Settings</h1>
      
      {/* Tab Navigation */}
      <div className="flex space-x-4 mb-6 border-b border-gray-700">
        <button 
          onClick={() => setActiveTab("email")}
          className={activeTab === "email" ? "border-b-2 border-blue-500" : ""}
        >
          Email
        </button>
        <button 
          onClick={() => setActiveTab("discord")}
          className={activeTab === "discord" ? "border-b-2 border-blue-500" : ""}
        >
          Discord
        </button>
        <button 
          onClick={() => setActiveTab("telegram")}
          className={activeTab === "telegram" ? "border-b-2 border-blue-500" : ""}
        >
          Telegram
        </button>
      </div>

      {/* Content */}
      <div>
        {activeTab === "email" && <NotificationsEmail />}
        {activeTab === "discord" && <NotificationsDiscord />}
        {activeTab === "telegram" && <NotificationsTelegram />}
      </div>
    </div>
  );
}
```

## Notes

- All components are client-side ("use client" directive)
- Password fields never return existing values from API for security
- Components handle authentication errors by redirecting to error messages
- Test buttons are disabled while saving or testing
- Save buttons are disabled when required fields are missing
- The NotificationTypeSelector is a shared component used by most notification types

## License

Based on Jellyseerr's notification system implementation, adapted for LeMedia.
