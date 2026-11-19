-- Opt-in: derive "recently added" from Zurg's WebDAV library for installs without Radarr/Sonarr.
ALTER TABLE "AppSettings" ADD COLUMN "zurgRecentEnabled" BOOLEAN NOT NULL DEFAULT false;
