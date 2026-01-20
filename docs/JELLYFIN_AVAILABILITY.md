# Jellyfin Availability & TV Episode Status

This document explains how Jellyfin availability is detected, how the cache works, and what to do when TV seasons/episodes look wrong.

## Overview

LeMedia uses two sources for TV status:

- **Jellyfin availability**: Determines if a show/episode has a *real file* in Jellyfin. This drives the green "Available" badge and the "Play on Jellyfin" button.
- **Sonarr monitoring**: Determines if a show is already in Sonarr and monitored. This affects the "Monitored" badge and whether the request button is shown.

Only **Jellyfin availability** should make something playable or "Available".

## How the availability cache works

LeMedia maintains a local cache table `jellyfin_availability` that stores what is actually on disk.

- For TV, it caches **episodes only** (and series/season metadata as needed for ID matching).
- Episodes are only cached if a **real file** exists (`Path`/`MediaSources`).
- It uses TMDB/TVDB IDs to match episodes back to the show pages.

This cache is used by the fast TV season endpoint so the UI stays snappy.

## Setup checklist

1. **Configure Jellyfin in Admin**
   - `/admin/settings/jellyfin`
   - Set host, port, SSL, and API key
   - Use "Sync libraries" and enable the libraries you want to scan

2. **Run the availability sync**
   - Click **Sync Availability Cache**
   - This updates episode availability for TV seasons and the "Available" badge

3. **Manual scan (optional)**
   - Click **Start scan** for an immediate full scan of enabled libraries
   - This also updates the cache and scan history

## Common issues and fixes

### 1) Scan stuck on "Scanning..."
This happens when database tables are missing.

Run:
```bash
psql -U lemedia -d lemedia -f /opt/LeMedia/db/010_jellyfin_availability_cache.sql
psql -U lemedia -d lemedia -f /opt/LeMedia/db/011_jellyfin_availability_job.sql
```

Then retry the scan.

### 2) Episodes show available when you don't have them
The cache only marks episodes available if they have real files. If you still see stale entries:

1. Run **Sync Availability Cache**
2. Refresh the TV page

The sync deletes stale rows that no longer exist on disk.

### 3) Shows are marked "Monitored" but not added
The "Monitored" badge comes from Sonarr.

If Sonarr returns incorrect matches, the request button can be hidden. Make sure the Sonarr series IDs match the actual TMDB/TVDB IDs for the show.

## What the buttons mean

- **Available**: Jellyfin has at least one episode file for the show.
- **Play on Jellyfin**: Only shown when availability is confirmed in Jellyfin.
- **Monitored**: The series exists in Sonarr and is set to monitored.

## Notes

- The availability cache runs hourly (job `jellyfin-availability-sync`).
- You can safely re-run Sync Availability Cache at any time.
- For large libraries, initial sync may take a few minutes.
