-- Drop the in-core support module. Tickets + messages are now owned by the
-- LeMedia-Plugin-Support plugin which keeps its own SQLite under data/plugins/<id>/.
-- The boot path runs `runLegacySupportExport` BEFORE this migration, dumping any rows
-- to data/support-export.json so the plugin can replay them on first install.
PRAGMA foreign_keys=OFF;
DROP TABLE IF EXISTS "TicketMessage";
DROP TABLE IF EXISTS "SupportTicket";
PRAGMA foreign_keys=ON;

-- Drop the supportEnabled flag from AppSettings. SQLite needs the table-rebuild dance
-- because pre-3.35 versions don't support DROP COLUMN, and we keep migrations portable.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" (
    "id", "defaultQualityProfile", "defaultMovieFolder", "defaultTvFolder", "defaultAnimeFolder",
    "plexMachineId", "lastRadarrSync", "lastSonarrSync", "syncIntervalHours", "notificationMatrix",
    "incidentBanner", "disabledLoginMode", "autoApproveRequests", "requestsEnabled", "calendarEnabled",
    "siteName", "registrationEnabled", "nsfwBlurEnabled", "missingSearchCooldownMin", "instanceLanguages",
    "siteUrl", "apiKey", "homepageLayout", "adminDashboardLayout", "verboseRequestLog", "customLinks",
    "setupChecklistDismissed", "updatedAt"
) SELECT
    "id", "defaultQualityProfile", "defaultMovieFolder", "defaultTvFolder", "defaultAnimeFolder",
    "plexMachineId", "lastRadarrSync", "lastSonarrSync", "syncIntervalHours", "notificationMatrix",
    "incidentBanner", "disabledLoginMode", "autoApproveRequests", "requestsEnabled", "calendarEnabled",
    "siteName", "registrationEnabled", "nsfwBlurEnabled", "missingSearchCooldownMin", "instanceLanguages",
    "siteUrl", "apiKey", "homepageLayout", "adminDashboardLayout", "verboseRequestLog", "customLinks",
    "setupChecklistDismissed", "updatedAt"
FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
