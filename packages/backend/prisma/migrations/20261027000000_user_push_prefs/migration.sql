-- Per-user phone/web push preferences: JSON map of notification type → enabled.
-- NULL (and any missing key) means "on", so existing users keep receiving everything.
ALTER TABLE "User" ADD COLUMN "pushPrefs" TEXT;
