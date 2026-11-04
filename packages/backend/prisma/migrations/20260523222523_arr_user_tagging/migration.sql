-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "defaultQualityProfile" INTEGER,
    "defaultMovieFolder" TEXT,
    "defaultTvFolder" TEXT,
    "defaultAnimeFolder" TEXT,
    "plexMachineId" TEXT,
    "lastRadarrSync" DATETIME,
    "lastSonarrSync" DATETIME,
    "syncIntervalHours" INTEGER NOT NULL DEFAULT 6,
    "notificationMatrix" TEXT,
    "incidentBanner" TEXT,
    "disabledLoginMode" TEXT NOT NULL DEFAULT 'friendly',
    "autoApproveRequests" BOOLEAN NOT NULL DEFAULT false,
    "requestsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "calendarEnabled" BOOLEAN NOT NULL DEFAULT true,
    "siteName" TEXT NOT NULL DEFAULT 'LeMedia',
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nsfwBlurEnabled" BOOLEAN NOT NULL DEFAULT true,
    "missingSearchCooldownMin" INTEGER NOT NULL DEFAULT 60,
    "instanceLanguages" TEXT NOT NULL DEFAULT '["en"]',
    "siteUrl" TEXT,
    "apiKey" TEXT,
    "homepageLayout" TEXT,
    "adminDashboardLayout" TEXT,
    "verboseRequestLog" BOOLEAN NOT NULL DEFAULT false,
    "customLinks" TEXT NOT NULL DEFAULT '[]',
    "setupChecklistDismissed" BOOLEAN NOT NULL DEFAULT false,
    "arrUserTaggingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("adminDashboardLayout", "apiKey", "autoApproveRequests", "calendarEnabled", "customLinks", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "disabledLoginMode", "homepageLayout", "id", "incidentBanner", "instanceLanguages", "lastRadarrSync", "lastSonarrSync", "missingSearchCooldownMin", "notificationMatrix", "nsfwBlurEnabled", "plexMachineId", "registrationEnabled", "requestsEnabled", "setupChecklistDismissed", "siteName", "siteUrl", "syncIntervalHours", "updatedAt", "verboseRequestLog") SELECT "adminDashboardLayout", "apiKey", "autoApproveRequests", "calendarEnabled", "customLinks", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "disabledLoginMode", "homepageLayout", "id", "incidentBanner", "instanceLanguages", "lastRadarrSync", "lastSonarrSync", "missingSearchCooldownMin", "notificationMatrix", "nsfwBlurEnabled", "plexMachineId", "registrationEnabled", "requestsEnabled", "setupChecklistDismissed", "siteName", "siteUrl", "syncIntervalHours", "updatedAt", "verboseRequestLog" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
