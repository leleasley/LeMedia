-- Admin → Lists: list subscriptions and handmade lists.
CREATE TABLE "ListSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "provider" TEXT NOT NULL DEFAULT '',
    "mediaType" TEXT NOT NULL DEFAULT 'mixed',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "seenKeys" TEXT NOT NULL DEFAULT '[]',
    "lastNew" TEXT NOT NULL DEFAULT '[]',
    "history" TEXT NOT NULL DEFAULT '[]',
    "lastResult" TEXT,
    "lastError" TEXT,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ListSubscription_url_key" ON "ListSubscription"("url");

CREATE TABLE "CustomList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "items" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
