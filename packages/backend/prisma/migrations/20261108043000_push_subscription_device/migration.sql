-- Identify the browser behind a push subscription so a replaced endpoint can be removed
-- instead of fanning the same alert out to every stale subscription the account has collected.
ALTER TABLE "PushSubscription" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "lastSeenAt" DATETIME;

CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
