-- DMM import history. Besides showing what has been imported, the row is the scheduled job's
-- dedupe key: a backup already recorded for that app is not sent to DMM again.
CREATE TABLE "DmmImport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "app" TEXT NOT NULL,
    "backupName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "found" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "alreadyWanted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "DmmImport_createdAt_idx" ON "DmmImport"("createdAt");
CREATE INDEX "DmmImport_app_backupName_idx" ON "DmmImport"("app", "backupName");
