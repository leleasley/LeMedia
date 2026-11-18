CREATE TABLE "MediaIssue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaId" INTEGER,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "adminNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolvedById" INTEGER,
    CONSTRAINT "MediaIssue_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MediaIssue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "MediaIssue_status_createdAt_idx" ON "MediaIssue"("status", "createdAt");
CREATE INDEX "MediaIssue_mediaId_idx" ON "MediaIssue"("mediaId");
CREATE INDEX "MediaIssue_userId_idx" ON "MediaIssue"("userId");
