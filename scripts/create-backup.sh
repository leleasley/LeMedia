#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/LeMedia}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3010}"

mkdir -p "$BACKUP_DIR"

if [[ -z "${LEMEDIA_ADMIN_COOKIE:-}" ]]; then
  echo "LEMEDIA_ADMIN_COOKIE is required."
  echo "Example: export LEMEDIA_ADMIN_COOKIE='lemedia_session=...; lemedia_csrf=...'"
  exit 1
fi

CSRF_TOKEN=$(echo "$LEMEDIA_ADMIN_COOKIE" | sed -n 's/.*lemedia_csrf=\([^;]*\).*/\1/p')
if [[ -z "$CSRF_TOKEN" ]]; then
  echo "Could not extract lemedia_csrf from LEMEDIA_ADMIN_COOKIE"
  exit 1
fi

echo "Creating backup via $WEB_URL/api/v1/admin/settings/backups ..."
RESP=$(curl -sS \
  -X POST \
  -H "Cookie: $LEMEDIA_ADMIN_COOKIE" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  "$WEB_URL/api/v1/admin/settings/backups")

echo "$RESP"
echo "Done."
