# Backup & Restore Runbook

## Overview

LeMedia provides backup archives through the admin UI:

- Path: `/admin/settings/maintenance`
- API:
  - `GET /api/v1/admin/settings/backups`
  - `POST /api/v1/admin/settings/backups`
  - `POST /api/v1/admin/settings/backups/{name}/validate`
  - `GET /api/v1/admin/settings/backups/{name}/download`

Each backup is a `.zip` archive containing:

- `manifest.json`
- `postgres/tables.json`
- `redis/keys.json`

## Storage

Backups are stored on the server in `BACKUP_DIR`.

- Default inside container: `/data/backups`
- Docker mount:
  - host: `/opt/LeMedia/backups`
  - container: `/data/backups`

`/opt/LeMedia/backups` is ignored by git.

## One-click CLI Scripts

These scripts call the same admin API:

- `scripts/create-backup.sh`
- `scripts/validate-backup.sh <backup-name.zip>`

Required env var for both scripts:

- `LEMEDIA_ADMIN_COOKIE` (must include `lemedia_session` and `lemedia_csrf`)

Optional:

- `WEB_URL` (default: `http://127.0.0.1:3010`)

## Restore Validation

Before any restore attempt:

1. Validate the backup archive from UI (`Validate`) or:
2. `scripts/validate-backup.sh <backup-name.zip>`
3. Confirm validation returns `ok: true` and expected table/key counts.

## Restore Procedure (Recommended)

1. Stop write traffic to LeMedia (maintenance mode).
2. Download and keep an extra copy of the target backup zip.
3. Extract and inspect:
   - `postgres/tables.json`
   - `redis/keys.json`
4. Restore to staging first, verify app behavior, then apply to production.
5. Re-enable traffic.

## Notes

- Backups are logical snapshots (JSON payloads), suitable for app-level restore workflows.
- For infrastructure-level disaster recovery, pair this with periodic volume snapshots of:
  - `/opt/LeMedia/db/data`
  - `/opt/LeMedia/redis/data`
