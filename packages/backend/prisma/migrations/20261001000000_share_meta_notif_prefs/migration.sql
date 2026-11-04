-- ShareLink display + view tracking
ALTER TABLE "ShareLink" ADD COLUMN "title" TEXT;
ALTER TABLE "ShareLink" ADD COLUMN "posterPath" TEXT;
ALTER TABLE "ShareLink" ADD COLUMN "views" INTEGER NOT NULL DEFAULT 0;

-- Per-user bell notification preferences (default on, existing users keep receiving)
ALTER TABLE "User" ADD COLUMN "notifyRequests" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyDigital" BOOLEAN NOT NULL DEFAULT true;
