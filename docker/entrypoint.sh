#!/bin/sh
# CalendarX container entrypoint — starts the thin API (:3101) and the web app
# (:3006). By default the web reaches the API at http://127.0.0.1:3101 inside the
# same container, so you can leave the API port private.
set -e

: "${API_PORT:=3101}"
: "${WEB_PORT:=3006}"
: "${CALENDARX_API_URL:=http://127.0.0.1:3101}"

# Thin CalDAV proxy + account gate. cwd = /app so CALENDARX_DATA_DIR defaults to
# /app/.data (override with CALENDARX_DATA_DIR, e.g. /data in compose).
cd /app
API_PID=
PORT="$API_PORT" node apps/server/dist/index.js &
API_PID=$!

# Web app (SSR + static). srvx binds to $PORT and resolves `-s ../client`
# relative to its own server file, so run it from apps/web.
cd /app/apps/web
WEB_PID=
PORT="$WEB_PORT" CALENDARX_API_URL="$CALENDARX_API_URL" \
  ./node_modules/.bin/srvx --prod -s ../client dist/server/server.js &
WEB_PID=$!

trap 'kill "$API_PID" "$WEB_PID" 2>/dev/null || true' INT TERM
wait "$API_PID" "$WEB_PID"